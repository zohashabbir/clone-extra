/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event';
import { DisposableStore } from '../../../../../../base/common/lifecycle';
import { ResourceMap } from '../../../../../../base/common/map';
import { waitForState } from '../../../../../../base/common/observable';
import { URI } from '../../../../../../base/common/uri';
import { mock } from '../../../../../../base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock';
import { IMarkerData, IMarkerService } from '../../../../../../platform/markers/common/markers';
import { ChatAgentLocation, IChatAgent, IChatAgentData, IChatAgentService } from '../../../../chat/common/chatAgents';
import { CellDiagnostics } from '../../../browser/contrib/cellDiagnostics/cellDiagnosticEditorContrib';
import { CodeCellViewModel } from '../../../browser/viewModel/codeCellViewModel';
import { CellKind, NotebookSetting } from '../../../common/notebookCommon';
import { ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookCellExecution, INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService';
import { setupInstantiationService, TestNotebookExecutionStateService, withTestNotebook } from '../testNotebookEditor';
import { nullExtensionDescription } from '../../../../../services/extensions/common/extensions';


suite('notebookCellDiagnostics', () => {

	let instantiationService: TestInstantiationService;
	let disposables: DisposableStore;
	let testExecutionService: TestExecutionService;
	let markerService: ITestMarkerService;

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	class TestExecutionService extends TestNotebookExecutionStateService {
		private _onDidChangeExecution = new Emitter<ICellExecutionStateChangedEvent | IExecutionStateChangedEvent>();
		override onDidChangeExecution = this._onDidChangeExecution.event;

		fireExecutionChanged(notebook: URI, cellHandle: number, changed?: INotebookCellExecution) {
			this._onDidChangeExecution.fire({
				type: NotebookExecutionType.cell,
				cellHandle,
				notebook,
				affectsNotebook: () => true,
				affectsCell: () => true,
				changed: changed
			});
		}
	}

	interface ITestMarkerService extends IMarkerService {
		markers: ResourceMap<IMarkerData[]>;
	}

	setup(function () {

		disposables = new DisposableStore();

		instantiationService = setupInstantiationService(disposables);
		testExecutionService = new TestExecutionService();
		instantiationService.stub(INotebookExecutionStateService, testExecutionService);

		const agentData = {
			extensionId: nullExtensionDescription.identifier,
			extensionDisplayName: '',
			extensionPublisherId: '',
			name: 'testEditorAgent',
			isDefault: true,
			locations: [ChatAgentLocation.Editor],
			metadata: {},
			slashCommands: [],
			disambiguation: [],
		};
		const chatAgentService = new class extends mock<IChatAgentService>() {
			override getAgents(): IChatAgentData[] {
				return [{
					id: 'testEditorAgent',
					...agentData
				}];
			}
			override onDidChangeAgents: Event<IChatAgent | undefined> = Event.None;
		};
		instantiationService.stub(IChatAgentService, chatAgentService);

		markerService = new class extends mock<ITestMarkerService>() {
			override markers: ResourceMap<IMarkerData[]> = new ResourceMap();
			override changeOne(owner: string, resource: URI, markers: IMarkerData[]) {
				this.markers.set(resource, markers);
			}
		};
		instantiationService.stub(IMarkerService, markerService);

		const config = instantiationService.get<IConfigurationService>(IConfigurationService) as TestConfigurationService;
		config.setUserConfiguration(NotebookSetting.cellFailureDiagnostics, true);
	});

	test('diagnostic is added for cell execution failure', async function () {
		await withTestNotebook([
			['print(x)', 'python', CellKind.Code, [], {}]
		], async (editor, viewModel, store, accessor) => {
			const cell = viewModel.viewCells[0] as CodeCellViewModel;

			disposables.add(instantiationService.createInstance(CellDiagnostics, editor));

			cell.model.internalMetadata.error = {
				message: 'error',
				stack: 'line 1 : print(x)',
				uri: cell.uri,
				location: { startColumn: 1, endColumn: 5, startLineNumber: 1, endLineNumber: 1 }
			};
			testExecutionService.fireExecutionChanged(editor.textModel.uri, cell.handle);

			await waitForState(cell.excecutionError, error => !!error);
			assert.strictEqual(cell?.excecutionError.get()?.message, 'error');
			assert.equal(markerService.markers.get(cell.uri)?.length, 1);
		}, instantiationService);
	});

	test('diagnostics are cleared only for cell with new execution', async function () {
		await withTestNotebook([
			['print(x)', 'python', CellKind.Code, [], {}],
			['print(y)', 'python', CellKind.Code, [], {}]
		], async (editor, viewModel, store, accessor) => {
			const cell = viewModel.viewCells[0] as CodeCellViewModel;
			const cell2 = viewModel.viewCells[1] as CodeCellViewModel;

			disposables.add(instantiationService.createInstance(CellDiagnostics, editor));

			cell.model.internalMetadata.error = {
				message: 'error',
				stack: 'line 1 : print(x)',
				uri: cell.uri,
				location: { startColumn: 1, endColumn: 5, startLineNumber: 1, endLineNumber: 1 }
			};
			cell2.model.internalMetadata.error = {
				message: 'another error',
				stack: 'line 1 : print(y)',
				uri: cell.uri,
				location: { startColumn: 1, endColumn: 5, startLineNumber: 1, endLineNumber: 1 }
			};
			testExecutionService.fireExecutionChanged(editor.textModel.uri, cell.handle);
			testExecutionService.fireExecutionChanged(editor.textModel.uri, cell2.handle);

			await waitForState(cell.excecutionError, error => !!error);
			await waitForState(cell2.excecutionError, error => !!error);
			cell.model.internalMetadata.error = undefined;

			// on NotebookCellExecution value will make it look like its currently running
			testExecutionService.fireExecutionChanged(editor.textModel.uri, cell.handle, {} as INotebookCellExecution);

			await waitForState(cell.excecutionError, error => error === undefined);

			assert.strictEqual(cell?.excecutionError.get(), undefined);
			assert.strictEqual(cell2?.excecutionError.get()?.message, 'another error', 'cell that was not executed should still have an error');
			assert.equal(markerService.markers.get(cell.uri)?.length, 0);
			assert.equal(markerService.markers.get(cell2.uri)?.length, 1);
		}, instantiationService);
	});
});
