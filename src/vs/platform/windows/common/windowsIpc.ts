/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWindowsService } from './windows';

export interface IWindowsChannel extends IChannel {
	call(command: 'openFileFolderPicker', args: [number, boolean]): TPromise<void>;
	call(command: 'openFilePicker', args: [number, boolean, string]): TPromise<void>;
	call(command: 'openFolderPicker', args: [number, boolean]): TPromise<void>;
	call(command: 'reloadWindow', arg: number): TPromise<void>;
	call(command: 'toggleDevTools', arg: number): TPromise<void>;
	call(command: 'closeFolder', arg: number): TPromise<void>;
	call(command: 'toggleFullScreen', arg: number): TPromise<void>;
	call(command: 'setRepresentedFilename', arg: [number, string]): TPromise<void>;
	call(command: 'getRecentlyOpen', arg: number): TPromise<{ files: string[]; folders: string[]; }>;
	call(command: 'focusWindow', arg: number): TPromise<void>;
	call(command: 'setDocumentEdited', args: [number, boolean]): TPromise<void>;
	call(command: 'toggleMenuBar', args: number): TPromise<void>;
	call(command: 'windowOpen', arg: [string[], boolean]): TPromise<void>;
	call(command: 'openNewWindow'): TPromise<void>;
	call(command: 'showWindow', arg: number): TPromise<void>;
	call(command: 'getWindows'): TPromise<{ id: number; path: string; title: string; }[]>;
	call(command: 'log', args: [string, string[]]): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class WindowsChannel implements IWindowsChannel {

	constructor(private service: IWindowsService) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'openFileFolderPicker': return this.service.openFileFolderPicker(arg[0], arg[1]);
			case 'openFilePicker': return this.service.openFilePicker(arg[0], arg[1], arg[2]);
			case 'openFolderPicker': return this.service.openFolderPicker(arg[0], arg[1]);
			case 'reloadWindow': return this.service.reloadWindow(arg);
			case 'openDevTools': return this.service.openDevTools(arg);
			case 'toggleDevTools': return this.service.toggleDevTools(arg);
			case 'closeFolder': return this.service.closeFolder(arg);
			case 'toggleFullScreen': return this.service.toggleFullScreen(arg);
			case 'setRepresentedFilename': return this.service.setRepresentedFilename(arg[0], arg[1]);
			case 'getRecentlyOpen': return this.service.getRecentlyOpen(arg);
			case 'focusWindow': return this.service.focusWindow(arg);
			case 'setDocumentEdited': return this.service.setDocumentEdited(arg[0], arg[1]);
			case 'toggleMenuBar': return this.service.toggleMenuBar(arg);
			case 'windowOpen': return this.service.windowOpen(arg[0], arg[1]);
			case 'openNewWindow': return this.service.openNewWindow();
			case 'showWindow': return this.service.showWindow(arg);
			case 'getWindows': return this.service.getWindows();
			case 'log': return this.service.log(arg[0], arg[1]);
		}
	}
}

export class WindowsChannelClient implements IWindowsService {

	_serviceBrand: any;

	constructor(private channel: IWindowsChannel) { }

	openFileFolderPicker(windowId: number, forceNewWindow?: boolean): TPromise<void> {
		return this.channel.call('openFileFolderPicker', [windowId, forceNewWindow]);
	}

	openFilePicker(windowId: number, forceNewWindow?: boolean, path?: string): TPromise<void> {
		return this.channel.call('openFilePicker', [windowId, forceNewWindow, path]);
	}

	openFolderPicker(windowId: number, forceNewWindow?: boolean): TPromise<void> {
		return this.channel.call('openFolderPicker', [windowId, forceNewWindow]);
	}

	reloadWindow(windowId: number): TPromise<void> {
		return this.channel.call('reloadWindow', windowId);
	}

	openDevTools(windowId: number): TPromise<void> {
		return this.channel.call('openDevTools', windowId);
	}

	toggleDevTools(windowId: number): TPromise<void> {
		return this.channel.call('toggleDevTools', windowId);
	}

	closeFolder(windowId: number): TPromise<void> {
		return this.channel.call('closeFolder', windowId);
	}

	toggleFullScreen(windowId: number): TPromise<void> {
		return this.channel.call('toggleFullScreen', windowId);
	}

	setRepresentedFilename(windowId: number, fileName: string): TPromise<void> {
		return this.channel.call('setRepresentedFilename', [windowId, fileName]);
	}

	getRecentlyOpen(windowId: number): TPromise<{ files: string[]; folders: string[]; }> {
		return this.channel.call('getRecentlyOpen', windowId);
	}

	focusWindow(windowId: number): TPromise<void> {
		return this.channel.call('focusWindow', windowId);
	}

	setDocumentEdited(windowId: number, flag: boolean): TPromise<void> {
		return this.channel.call('setDocumentEdited', [windowId, flag]);
	}

	toggleMenuBar(windowId: number): TPromise<void> {
		return this.channel.call('toggleMenuBar', windowId);
	}

	windowOpen(paths: string[], forceNewWindow?: boolean): TPromise<void> {
		return this.channel.call('windowOpen', [paths, forceNewWindow]);
	}

	openNewWindow(): TPromise<void> {
		return this.channel.call('openNewWindow');
	}

	showWindow(windowId: number): TPromise<void> {
		return this.channel.call('showWindow', windowId);
	}

	getWindows(): TPromise<{ id: number; path: string; title: string; }[]> {
		return this.channel.call('getWindows');
	}

	log(severity: string, ...messages: string[]): TPromise<void> {
		return this.channel.call('log', [severity, messages]);
	}
}