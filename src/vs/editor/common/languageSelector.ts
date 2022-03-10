/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRelativePattern, match as matchGlobPattern } from 'vs/base/common/glob';
import { URI } from 'vs/base/common/uri';
import { normalize } from 'vs/base/common/path';

export interface NotebookFilter {
	readonly notebookType?: string;
	readonly scheme?: string;
	readonly pattern?: string | IRelativePattern;
}

export interface LanguageFilter {
	readonly language?: string;
	readonly scheme?: string;
	readonly pattern?: string | IRelativePattern;

	/** @internal */
	readonly notebook?: string | NotebookFilter;
	/**
	 * This provider is implemented in the UI thread.
	 */
	readonly hasAccessToAllModels?: boolean;
	readonly exclusive?: boolean;
}

export type LanguageSelector = string | LanguageFilter | ReadonlyArray<string | LanguageFilter>;

export function score(selector: LanguageSelector | undefined, candidateUri: URI, candidateLanguage: string, candidateIsSynchronized: boolean, candidateNotebookInfo: { notebookUri: URI; notebookType: string } | undefined): number {

	if (Array.isArray(selector)) {
		// array -> take max individual value
		let ret = 0;
		for (const filter of selector) {
			const value = score(filter, candidateUri, candidateLanguage, candidateIsSynchronized, candidateNotebookInfo);
			if (value === 10) {
				return value; // already at the highest
			}
			if (value > ret) {
				ret = value;
			}
		}
		return ret;

	} else if (typeof selector === 'string') {

		if (!candidateIsSynchronized) {
			return 0;
		}

		// short-hand notion, desugars to
		// 'fooLang' -> { language: 'fooLang'}
		// '*' -> { language: '*' }
		if (selector === '*') {
			return 5;
		} else if (selector === candidateLanguage) {
			return 10;
		} else {
			return 0;
		}

	} else if (selector) {
		// filter -> select accordingly, use defaults for scheme
		const { language, pattern, scheme, hasAccessToAllModels, notebook } = selector as LanguageFilter; // TODO: microsoft/TypeScript#42768

		if (!candidateIsSynchronized && !hasAccessToAllModels) {
			return 0;
		}

		if (notebook) {
			if (!candidateNotebookInfo) {
				return 0;
			}
			let notebookScore = 0;
			if (typeof notebook === 'string') {
				notebookScore = _scoreOne(undefined, notebook, undefined, candidateNotebookInfo!.notebookUri, candidateNotebookInfo!.notebookType);
			} else {
				notebookScore = _scoreOne(notebook.scheme, notebook.notebookType, notebook.pattern, candidateNotebookInfo!.notebookUri, candidateNotebookInfo!.notebookType);
			}
			if (notebookScore === 0) {
				return 0;
			}
			if (!scheme && !language && !pattern) {
				return notebookScore;
			}
			const documentScore = _scoreOne(scheme, language, pattern, candidateUri, candidateLanguage);
			if (documentScore === 0) {
				return 0;
			}
			return Math.max(notebookScore, documentScore);

		} else {
			return _scoreOne(scheme, language, pattern, candidateUri, candidateLanguage);
		}


	} else {
		return 0;
	}
}

function _scoreOne(scheme: string | undefined, language: string | undefined, pattern: string | IRelativePattern | undefined, candidateUri: URI, candidateLanguage: string) {

	let ret = 0;

	if (scheme) {
		if (scheme === candidateUri.scheme) {
			ret = 10;
		} else if (scheme === '*') {
			ret = 5;
		} else {
			return 0;
		}
	}

	if (language) {
		if (language === candidateLanguage) {
			ret = 10;
		} else if (language === '*') {
			ret = Math.max(ret, 5);
		} else {
			return 0;
		}
	}

	if (pattern) {
		let normalizedPattern: string | IRelativePattern;
		if (typeof pattern === 'string') {
			normalizedPattern = pattern;
		} else {
			// Since this pattern has a `base` property, we need
			// to normalize this path first before passing it on
			// because we will compare it against `Uri.fsPath`
			// which uses platform specific separators.
			// Refs: https://github.com/microsoft/vscode/issues/99938
			normalizedPattern = { ...pattern, base: normalize(pattern.base) };
		}

		if (normalizedPattern === candidateUri.fsPath || matchGlobPattern(normalizedPattern, candidateUri.fsPath)) {
			ret = 10;
		} else {
			return 0;
		}
	}

	return ret;
}
