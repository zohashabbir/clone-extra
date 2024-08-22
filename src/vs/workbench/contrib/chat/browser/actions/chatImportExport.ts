/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer';
import { joinPath } from '../../../../../base/common/resources';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions';
import { localize, localize2 } from '../../../../../nls';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs';
import { IFileService } from '../../../../../platform/files/common/files';
import { CHAT_CATEGORY } from './chatActions';
import { IChatWidgetService } from '../chat';
import { IChatEditorOptions } from '../chatEditor';
import { ChatEditorInput } from '../chatEditorInput';
import { CONTEXT_CHAT_ENABLED } from '../../common/chatContextKeys';
import { isExportableSessionData } from '../../common/chatModel';
import { IChatService } from '../../common/chatService';
import { IEditorService } from '../../../../services/editor/common/editorService';

const defaultFileName = 'chat.json';
const filters = [{ name: localize('chat.file.label', "Chat Session"), extensions: ['json'] }];

export function registerChatExportActions() {
	registerAction2(class ExportChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.export',
				category: CHAT_CATEGORY,
				title: localize2('chat.export.label', "Export Chat..."),
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const chatService = accessor.get(IChatService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget || !widget.viewModel) {
				return;
			}

			const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);
			const result = await fileDialogService.showSaveDialog({
				defaultUri,
				filters
			});
			if (!result) {
				return;
			}

			const model = chatService.getSession(widget.viewModel.sessionId);
			if (!model) {
				return;
			}

			// Using toJSON on the model
			const content = VSBuffer.fromString(JSON.stringify(model.toExport(), undefined, 2));
			await fileService.writeFile(result, content);
		}
	});

	registerAction2(class ImportChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.import',
				title: localize2('chat.import.label', "Import Chat..."),
				category: CHAT_CATEGORY,
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const editorService = accessor.get(IEditorService);

			const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);
			const result = await fileDialogService.showOpenDialog({
				defaultUri,
				canSelectFiles: true,
				filters
			});
			if (!result) {
				return;
			}

			const content = await fileService.readFile(result[0]);
			try {
				const data = JSON.parse(content.value.toString());
				if (!isExportableSessionData(data)) {
					throw new Error('Invalid chat session data');
				}

				const options: IChatEditorOptions = { target: { data }, pinned: true };
				await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options });
			} catch (err) {
				throw err;
			}
		}
	});
}
