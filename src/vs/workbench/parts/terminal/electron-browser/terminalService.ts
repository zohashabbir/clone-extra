/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as pfs from 'vs/base/node/pfs';
import * as platform from 'vs/base/common/platform';
import product from 'vs/platform/node/product';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWindowIPCService } from 'vs/workbench/services/window/electron-browser/windowService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IQuickOpenService, IPickOpenEntry, IPickOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { ITerminalInstance, ITerminalService, IShellLaunchConfig, ITerminalConfigHelper } from 'vs/workbench/parts/terminal/common/terminal';
import { TerminalService as AbstractTerminalService } from 'vs/workbench/parts/terminal/common/terminalService';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { TerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import { TPromise } from 'vs/base/common/winjs.base';

export class TerminalService extends AbstractTerminalService implements ITerminalService {
	private _configHelper: TerminalConfigHelper;

	public get configHelper(): ITerminalConfigHelper { return this._configHelper; };

	constructor(
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IPanelService _panelService: IPanelService,
		@IPartService _partService: IPartService,
		@ILifecycleService _lifecycleService: ILifecycleService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IWindowIPCService private _windowService: IWindowIPCService,
		@IQuickOpenService private _quickOpenService: IQuickOpenService
	) {
		super(_contextKeyService, _configurationService, _panelService, _partService, _lifecycleService);

		this._configHelper = this._instantiationService.createInstance(TerminalConfigHelper, platform.platform);
	}

	public createInstance(shell: IShellLaunchConfig = {}): ITerminalInstance {
		// TODO: Inform user of possibility to change shell on Windows
		let terminalInstance = this._instantiationService.createInstance(TerminalInstance,
			this._terminalFocusContextKey,
			this._configHelper,
			this._terminalContainer,
			shell);
		terminalInstance.addDisposable(terminalInstance.onTitleChanged(this._onInstanceTitleChanged.fire, this._onInstanceTitleChanged));
		terminalInstance.addDisposable(terminalInstance.onDisposed(this._onInstanceDisposed.fire, this._onInstanceDisposed));
		terminalInstance.addDisposable(terminalInstance.onProcessIdReady(this._onInstanceProcessIdReady.fire, this._onInstanceProcessIdReady));
		this.terminalInstances.push(terminalInstance);
		if (this.terminalInstances.length === 1) {
			// It's the first instance so it should be made active automatically
			this.setActiveInstanceByIndex(0);
		}
		this._onInstancesChanged.fire();
		return terminalInstance;
	}

	public selectDefaultWindowsShell(): TPromise<string> {
		return this._detectWindowsShells().then(shells => {
			const options: IPickOptions = {
				placeHolder: nls.localize('terminal.integrated.chooseWindowsShell', "Select your preferred terminal shell, you can change this later in your settings")
			};
			return this._quickOpenService.pick(shells, options).then(value => {
				return TPromise.as(value ? value.description : null);
			});
		});
	}

	private _detectWindowsShells(): TPromise<IPickOpenEntry[]> {
		const windir = process.env['windir'];
		const expectedLocations = {
			'Command Prompt': [
				`${windir}\\Sysnative\\cmd.exe`,
				`${windir}\\System32\\cmd.exe`
			],
			PowerShell: [
				`${windir}\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe`,
				`${windir}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
			],
			'WSL Bash': [`${windir}\\Sysnative\\bash.exe`],
			'Git Bash': [
				`${process.env['ProgramW6432']}\\Git\\bin\\bash.exe`,
				`${process.env['ProgramW6432']}\\Git\\usr\\bin\\bash.exe`,
				`${process.env['ProgramFiles']}\\Git\\bin\\bash.exe`,
				`${process.env['ProgramFiles']}\\Git\\usr\\bin\\bash.exe`,
			]
		};
		const promises: TPromise<[string, string]>[] = [];
		Object.keys(expectedLocations).forEach(key => promises.push(this._validateShellPaths(key, expectedLocations[key])));
		return TPromise.join(promises).then(results => {
			return results.filter(result => !!result).map(result => {
				return <IPickOpenEntry>{
					label: result[0],
					description: result[1]
				};
			});
		});
	}

	private _validateShellPaths(label: string, potentialPaths: string[]): TPromise<[string, string]> {
		const current = potentialPaths.shift();
		return pfs.fileExists(current).then(exists => {
			if (!exists) {
				if (potentialPaths.length === 0) {
					return null;
				}
				return this._validateShellPaths(label, potentialPaths);
			}
			return [label, current];
		});
	}

	public getActiveOrCreateInstance(): ITerminalInstance {
		const activeInstance = this.getActiveInstance();
		return activeInstance ? activeInstance : this.createInstance();
	}

	protected _showTerminalCloseConfirmation(): boolean {
		const cancelId = 1;
		let message;
		if (this.terminalInstances.length === 1) {
			message = nls.localize('terminalService.terminalCloseConfirmationSingular', "There is an active terminal session, do you want to kill it?");
		} else {
			message = nls.localize('terminalService.terminalCloseConfirmationPlural', "There are {0} active terminal sessions, do you want to kill them?", this.terminalInstances.length);
		}
		const opts: Electron.ShowMessageBoxOptions = {
			title: product.nameLong,
			message,
			type: 'warning',
			buttons: [nls.localize('yes', "Yes"), nls.localize('cancel', "Cancel")],
			noLink: true,
			cancelId
		};
		return this._windowService.getWindow().showMessageBox(opts) === cancelId;
	}

	public setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void {
		this._configHelper.panelContainer = panelContainer;
		this._terminalContainer = terminalContainer;
		this._terminalInstances.forEach(terminalInstance => {
			terminalInstance.attachToElement(this._terminalContainer);
		});
	}
}
