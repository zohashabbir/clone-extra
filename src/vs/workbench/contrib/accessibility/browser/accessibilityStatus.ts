/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle';
import { Event } from '../../../../base/common/event';
import Severity from '../../../../base/common/severity';
import { localize } from '../../../../nls';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility';
import { CommandsRegistry } from '../../../../platform/commands/common/commands';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { INotificationHandle, INotificationService, NotificationPriority } from '../../../../platform/notification/common/notification';
import { IWorkbenchContribution } from '../../../common/contributions';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar';

export class AccessibilityStatus extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.accessibilityStatus';

	private screenReaderNotification: INotificationHandle | null = null;
	private promptedScreenReader: boolean = false;
	private readonly screenReaderModeElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) {
		super();

		this._register(CommandsRegistry.registerCommand({ id: 'showEditorScreenReaderNotification', handler: () => this.showScreenReaderNotification() }));

		this.updateScreenReaderModeElement(this.accessibilityService.isScreenReaderOptimized());

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.onScreenReaderModeChange()));

		this._register(this.configurationService.onDidChangeConfiguration(c => {
			if (c.affectsConfiguration('editor.accessibilitySupport')) {
				this.onScreenReaderModeChange();
			}
		}));
	}

	private showScreenReaderNotification(): void {
		this.screenReaderNotification = this.notificationService.prompt(
			Severity.Info,
			localize('screenReaderDetectedExplanation.question', "Are you using a screen reader to operate VS Code?"),
			[{
				label: localize('screenReaderDetectedExplanation.answerYes', "Yes"),
				run: () => {
					this.configurationService.updateValue('editor.accessibilitySupport', 'on', ConfigurationTarget.USER);
				}
			}, {
				label: localize('screenReaderDetectedExplanation.answerNo', "No"),
				run: () => {
					this.configurationService.updateValue('editor.accessibilitySupport', 'off', ConfigurationTarget.USER);
				}
			}],
			{
				sticky: true,
				priority: NotificationPriority.URGENT
			}
		);

		Event.once(this.screenReaderNotification.onDidClose)(() => this.screenReaderNotification = null);
	}
	private updateScreenReaderModeElement(visible: boolean): void {
		if (visible) {
			if (!this.screenReaderModeElement.value) {
				const text = localize('screenReaderDetected', "Screen Reader Optimized");
				this.screenReaderModeElement.value = this.statusbarService.addEntry({
					name: localize('status.editor.screenReaderMode', "Screen Reader Mode"),
					text,
					ariaLabel: text,
					command: 'showEditorScreenReaderNotification',
					kind: 'prominent',
					showInAllWindows: true
				}, 'status.editor.screenReaderMode', StatusbarAlignment.RIGHT, 100.6);
			}
		} else {
			this.screenReaderModeElement.clear();
		}
	}

	private onScreenReaderModeChange(): void {

		// We only support text based editors
		const screenReaderDetected = this.accessibilityService.isScreenReaderOptimized();
		if (screenReaderDetected) {
			const screenReaderConfiguration = this.configurationService.getValue('editor.accessibilitySupport');
			if (screenReaderConfiguration === 'auto') {
				if (!this.promptedScreenReader) {
					this.promptedScreenReader = true;
					setTimeout(() => this.showScreenReaderNotification(), 100);
				}
			}
		}

		if (this.screenReaderNotification) {
			this.screenReaderNotification.close();
		}
		this.updateScreenReaderModeElement(this.accessibilityService.isScreenReaderOptimized());
	}
}
