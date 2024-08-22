/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../base/common/async';
import { CancellationToken } from '../../../../base/common/cancellation';
import { ILogService } from '../../../../platform/log/common/log';
import { IProgress, IProgressStep } from '../../../../platform/progress/common/progress';
import { ITextFileSaveParticipant, ITextFileEditorModel, ITextFileSaveParticipantContext } from './textfiles';
import { IDisposable, Disposable, toDisposable } from '../../../../base/common/lifecycle';
import { insert } from '../../../../base/common/arrays';

export class TextFileSaveParticipant extends Disposable {

	private readonly saveParticipants: ITextFileSaveParticipant[] = [];

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	addSaveParticipant(participant: ITextFileSaveParticipant): IDisposable {
		const remove = insert(this.saveParticipants, participant);

		return toDisposable(() => remove());
	}

	async participate(model: ITextFileEditorModel, context: ITextFileSaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {

		// undoStop before participation
		model.textEditorModel?.pushStackElement();

		for (const saveParticipant of this.saveParticipants) {
			if (token.isCancellationRequested || !model.textEditorModel /* disposed */) {
				break;
			}

			try {
				const promise = saveParticipant.participate(model, context, progress, token);
				await raceCancellation(promise, token);
			} catch (err) {
				this.logService.error(err);
			}
		}

		// undoStop after participation
		model.textEditorModel?.pushStackElement();
	}

	override dispose(): void {
		this.saveParticipants.splice(0, this.saveParticipants.length);

		super.dispose();
	}
}
