/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractExtHostConsoleForwarder } from '../common/extHostConsoleForwarder';
import { IExtHostInitDataService } from '../common/extHostInitDataService';
import { IExtHostRpcService } from '../common/extHostRpcService';

export class ExtHostConsoleForwarder extends AbstractExtHostConsoleForwarder {

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		super(extHostRpc, initData);
	}

	protected override _nativeConsoleLogMessage(_method: unknown, original: (...args: any[]) => void, args: IArguments) {
		original.apply(console, args as any);
	}
}
