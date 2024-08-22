/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { AccessibilityProgressSignalScheduler } from '../../../../platform/accessibilitySignal/browser/progressAccessibilitySignalScheduler';
import { IChatAccessibilityService } from './chat';
import { IChatResponseViewModel } from '../common/chatViewModel';
import { renderStringAsPlaintext } from '../../../../base/browser/markdownRenderer';
import { MarkdownString } from '../../../../base/common/htmlContent';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { AccessibilityVoiceSettingId } from '../../accessibility/browser/accessibilityConfiguration';

const CHAT_RESPONSE_PENDING_ALLOWANCE_MS = 4000;
export class ChatAccessibilityService extends Disposable implements IChatAccessibilityService {

	declare readonly _serviceBrand: undefined;

	private _pendingSignalMap: DisposableMap<number, AccessibilityProgressSignalScheduler> = this._register(new DisposableMap());

	private _requestId: number = 0;

	constructor(
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
	}
	acceptRequest(): number {
		this._requestId++;
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatRequestSent, { allowManyInParallel: true });
		this._pendingSignalMap.set(this._requestId, this._instantiationService.createInstance(AccessibilityProgressSignalScheduler, CHAT_RESPONSE_PENDING_ALLOWANCE_MS, undefined));
		return this._requestId;
	}
	acceptResponse(response: IChatResponseViewModel | string | undefined, requestId: number): void {
		this._pendingSignalMap.deleteAndDispose(requestId);
		const isPanelChat = typeof response !== 'string';
		const responseContent = typeof response === 'string' ? response : response?.response.toString();
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatResponseReceived, { allowManyInParallel: true });
		if (!response || !responseContent) {
			return;
		}
		const errorDetails = isPanelChat && response.errorDetails ? ` ${response.errorDetails.message}` : '';
		const plainTextResponse = renderStringAsPlaintext(new MarkdownString(responseContent));
		if (this._configurationService.getValue(AccessibilityVoiceSettingId.AutoSynthesize) !== 'on') {
			status(plainTextResponse + errorDetails);
		}
	}
}
