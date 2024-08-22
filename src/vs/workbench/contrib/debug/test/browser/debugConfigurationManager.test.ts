/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation';
import { Event } from '../../../../../base/common/event';
import { DisposableStore } from '../../../../../base/common/lifecycle';
import { URI } from '../../../../../base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService';
import { FileService } from '../../../../../platform/files/common/fileService';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock';
import { NullLogService } from '../../../../../platform/log/common/log';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService';
import { ConfigurationManager } from '../../browser/debugConfigurationManager';
import { DebugConfigurationProviderTriggerKind, IAdapterManager, IConfig, IDebugAdapterExecutable, IDebugSession } from '../../common/debug';
import { IPreferencesService } from '../../../../services/preferences/common/preferences';
import { TestQuickInputService } from '../../../../test/browser/workbenchTestServices';
import { TestHistoryService, TestContextService, TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices';

suite('debugConfigurationManager', () => {
	const configurationProviderType = 'custom-type';
	let _debugConfigurationManager: ConfigurationManager;
	let disposables: DisposableStore;

	const adapterManager = <IAdapterManager>{
		getDebugAdapterDescriptor(session: IDebugSession, config: IConfig): Promise<IDebugAdapterExecutable | undefined> {
			return Promise.resolve(undefined);
		},

		activateDebuggers(activationEvent: string, debugType?: string): Promise<void> {
			return Promise.resolve();
		},

		get onDidDebuggersExtPointRead(): Event<void> {
			return Event.None;
		}
	};

	const preferencesService = <IPreferencesService>{
		userSettingsResource: URI.file('/tmp/settings.json')
	};

	const configurationService = new TestConfigurationService();
	setup(() => {
		disposables = new DisposableStore();
		const fileService = disposables.add(new FileService(new NullLogService()));
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([IPreferencesService, preferencesService], [IConfigurationService, configurationService])));
		_debugConfigurationManager = new ConfigurationManager(
			adapterManager,
			new TestContextService(),
			configurationService,
			new TestQuickInputService(),
			instantiationService,
			new TestStorageService(),
			new TestExtensionService(),
			new TestHistoryService(),
			new UriIdentityService(fileService),
			new ContextKeyService(configurationService),
			new NullLogService());
	});

	teardown(() => disposables.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves configuration based on type', async () => {
		disposables.add(_debugConfigurationManager.registerDebugConfigurationProvider({
			type: configurationProviderType,
			resolveDebugConfiguration: (folderUri, config, token) => {
				assert.strictEqual(config.type, configurationProviderType);
				return Promise.resolve({
					...config,
					configurationResolved: true
				});
			},
			triggerKind: DebugConfigurationProviderTriggerKind.Initial
		}));

		const initialConfig: IConfig = {
			type: configurationProviderType,
			request: 'launch',
			name: 'configName',
		};

		const resultConfig = await _debugConfigurationManager.resolveConfigurationByProviders(undefined, configurationProviderType, initialConfig, CancellationToken.None);
		assert.strictEqual((resultConfig as any).configurationResolved, true, 'Configuration should be updated by test provider');
	});

	test('resolves configuration from second provider if type changes', async () => {
		const secondProviderType = 'second-provider';
		disposables.add(_debugConfigurationManager.registerDebugConfigurationProvider({
			type: configurationProviderType,
			resolveDebugConfiguration: (folderUri, config, token) => {
				assert.strictEqual(config.type, configurationProviderType);
				return Promise.resolve({
					...config,
					type: secondProviderType
				});
			},
			triggerKind: DebugConfigurationProviderTriggerKind.Initial
		}));
		disposables.add(_debugConfigurationManager.registerDebugConfigurationProvider({
			type: secondProviderType,
			resolveDebugConfiguration: (folderUri, config, token) => {
				assert.strictEqual(config.type, secondProviderType);
				return Promise.resolve({
					...config,
					configurationResolved: true
				});
			},
			triggerKind: DebugConfigurationProviderTriggerKind.Initial
		}));

		const initialConfig: IConfig = {
			type: configurationProviderType,
			request: 'launch',
			name: 'configName',
		};

		const resultConfig = await _debugConfigurationManager.resolveConfigurationByProviders(undefined, configurationProviderType, initialConfig, CancellationToken.None);
		assert.strictEqual(resultConfig!.type, secondProviderType);
		assert.strictEqual((resultConfig as any).configurationResolved, true, 'Configuration should be updated by test provider');
	});

	teardown(() => disposables.clear());
});
