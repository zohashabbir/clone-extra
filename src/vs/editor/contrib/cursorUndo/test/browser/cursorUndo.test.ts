/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils';
import { CoreEditingCommands, CoreNavigationCommands } from '../../../../browser/coreCommands';
import { Selection } from '../../../../common/core/selection';
import { Handler } from '../../../../common/editorCommon';
import { CursorUndo, CursorUndoRedoController } from '../../browser/cursorUndo';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor';

suite('FindController', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const cursorUndoAction = new CursorUndo();

	test('issue #82535: Edge case with cursorUndo', () => {
		withTestCodeEditor('', {}, (editor) => {

			editor.registerAndInstantiateContribution(CursorUndoRedoController.ID, CursorUndoRedoController);

			// type hello
			editor.trigger('test', Handler.Type, { text: 'hello' });

			// press left
			CoreNavigationCommands.CursorLeft.runEditorCommand(null, editor, {});

			// press Delete
			CoreEditingCommands.DeleteRight.runEditorCommand(null, editor, {});
			assert.deepStrictEqual(editor.getValue(), 'hell');
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 5, 1, 5)]);

			// press left
			CoreNavigationCommands.CursorLeft.runEditorCommand(null, editor, {});
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 4)]);

			// press Ctrl+U
			cursorUndoAction.run(null!, editor, {});
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 5, 1, 5)]);
		});
	});

	test('issue #82535: Edge case with cursorUndo (reverse)', () => {
		withTestCodeEditor('', {}, (editor) => {

			editor.registerAndInstantiateContribution(CursorUndoRedoController.ID, CursorUndoRedoController);

			// type hello
			editor.trigger('test', Handler.Type, { text: 'hell' });
			editor.trigger('test', Handler.Type, { text: 'o' });
			assert.deepStrictEqual(editor.getValue(), 'hello');
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 6, 1, 6)]);

			// press Ctrl+U
			cursorUndoAction.run(null!, editor, {});
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 6, 1, 6)]);
		});
	});
});
