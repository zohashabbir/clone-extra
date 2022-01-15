/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { OpenDocumentLinkCommand } from '../commands/openDocumentLink';
import { MarkdownEngine } from '../markdownEngine';
import { getUriForLinkWithKnownExternalScheme, isOfScheme, Schemes } from '../util/links';
import { dirname } from '../util/path';

const localize = nls.loadMessageBundle();

function parseLink(
	document: vscode.TextDocument,
	link: string,
): { uri: vscode.Uri, tooltip?: string } | undefined {

	const cleanLink = stripAngleBrackets(link);
	const externalSchemeUri = getUriForLinkWithKnownExternalScheme(cleanLink);
	if (externalSchemeUri) {
		// Normalize VS Code links to target currently running version
		if (isOfScheme(Schemes.vscode, link) || isOfScheme(Schemes['vscode-insiders'], link)) {
			return { uri: vscode.Uri.parse(link).with({ scheme: vscode.env.uriScheme }) };
		}
		return { uri: externalSchemeUri };
	}

	// Assume it must be an relative or absolute file path
	// Use a fake scheme to avoid parse warnings
	const tempUri = vscode.Uri.parse(`vscode-resource:${link}`);

	let resourceUri: vscode.Uri | undefined;
	if (!tempUri.path) {
		resourceUri = document.uri;
	} else if (tempUri.path[0] === '/') {
		const root = getWorkspaceFolder(document);
		if (root) {
			resourceUri = vscode.Uri.joinPath(root, tempUri.path);
		}
	} else {
		if (document.uri.scheme === Schemes.untitled) {
			const root = getWorkspaceFolder(document);
			if (root) {
				resourceUri = vscode.Uri.joinPath(root, tempUri.path);
			}
		} else {
			const base = document.uri.with({ path: dirname(document.uri.fsPath) });
			resourceUri = vscode.Uri.joinPath(base, tempUri.path);
		}
	}

	if (!resourceUri) {
		return undefined;
	}

	resourceUri = resourceUri.with({ fragment: tempUri.fragment });

	return {
		uri: OpenDocumentLinkCommand.createCommandUri(document.uri, resourceUri, tempUri.fragment),
		tooltip: localize('documentLink.tooltip', 'Follow link')
	};
}

function getWorkspaceFolder(document: vscode.TextDocument) {
	return vscode.workspace.getWorkspaceFolder(document.uri)?.uri
		|| vscode.workspace.workspaceFolders?.[0]?.uri;
}

function extractDocumentLink(
	document: vscode.TextDocument,
	pre: number,
	link: string,
	matchIndex: number | undefined
): vscode.DocumentLink | undefined {
	const offset = (matchIndex || 0) + pre;
	const linkStart = document.positionAt(offset);
	const linkEnd = document.positionAt(offset + link.length);
	try {
		const linkData = parseLink(document, link);
		if (!linkData) {
			return undefined;
		}
		const documentLink = new vscode.DocumentLink(
			new vscode.Range(linkStart, linkEnd),
			linkData.uri);
		documentLink.tooltip = linkData.tooltip;
		return documentLink;
	} catch (e) {
		return undefined;
	}
}

const angleBracketLinkRe = /^<(.*)>$/;

/**
 * Used to strip brackets from the markdown link
 *
 * <http://example.com> will be transformed to http://example.com
*/
export function stripAngleBrackets(link: string) {
	return link.replace(angleBracketLinkRe, '$1');
}

const inlineCodeAndLinkPattern = /(?:(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`))|(\[((!\[[^\]]*?\]\(\s*)([^\s\(\)]+?)\s*\)\]|(?:\\\]|[^\]])*\])\(\s*)(([^\s\(\)]|\([^\s\(\)]*?\))+)\s*(".*?")?\)/g;
const referenceLinkPattern = /(\[((?:\\\]|[^\]])+)\]\[\s*?)([^\s\]]*?)\]/g;
const definitionPattern = /^([\t ]*\[(?!\^)((?:\\\]|[^\]])+)\]:\s*)([^<]\S*|<[^>]+>)/gm;

const binarySearchPairs = (pairs: number[][], start: number, end: number, target: number): Boolean => {
	if (start > end) {
		return false;
	}
	const mid = start + Math.floor((end - start) / 2);
	const pair = pairs[mid];
	if (target >= pair[0] && target < pair[1]) {
		return true;
	}
	if (target >= pair[1]) {
		return binarySearchPairs(pairs, mid + 1, end, target);
	}
	return binarySearchPairs(pairs, start, mid - 1, target);
};

export default class LinkProvider implements vscode.DocumentLinkProvider {

	private _codeOrFenceLineIntervals: number[][] = [];

	constructor(
		private readonly engine: MarkdownEngine
	) { }

	private isLineInsideIndentedOrFencedCode(line: number): Boolean {
		return binarySearchPairs(this._codeOrFenceLineIntervals, 0, this._codeOrFenceLineIntervals.length - 1, line);
	}

	public async provideDocumentLinks(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): Promise<vscode.DocumentLink[]> {
		const text = document.getText();
		const tokens = await this.engine.parse(document);
		this._codeOrFenceLineIntervals = tokens.reduce<number[][]>((acc, t) => {
			if ((t.type === 'code_block' || t.type === 'fence') && t.map) {
				return [...acc, t.map];
			}
			return acc;
		}, []);
		return [
			...this.providerInlineLinks(text, document),
			...this.provideReferenceLinks(text, document)
		];
	}

	private providerInlineLinks(
		text: string,
		document: vscode.TextDocument
	): vscode.DocumentLink[] {
		const results: vscode.DocumentLink[] = [];
		for (const match of text.matchAll(inlineCodeAndLinkPattern)) {
			if (match[1]) {
				continue;
			}
			const matchImage = match[5] && extractDocumentLink(document, match[4].length + 1, match[5], match.index);
			if (matchImage && !this.isLineInsideIndentedOrFencedCode(matchImage.range.start.line)) {
				results.push(matchImage);
			}
			const matchLink = extractDocumentLink(document, match[2].length, match[6], match.index);
			if (matchLink && !this.isLineInsideIndentedOrFencedCode(matchLink.range.start.line)) {
				results.push(matchLink);
			}
		}
		return results;
	}

	private provideReferenceLinks(
		text: string,
		document: vscode.TextDocument,
	): vscode.DocumentLink[] {
		const results: vscode.DocumentLink[] = [];

		const definitions = LinkProvider.getDefinitions(text, document);
		for (const match of text.matchAll(referenceLinkPattern)) {
			let linkStart: vscode.Position;
			let linkEnd: vscode.Position;
			let reference = match[3];
			if (reference) { // [text][ref]
				const pre = match[1];
				const offset = (match.index || 0) + pre.length;
				linkStart = document.positionAt(offset);
				linkEnd = document.positionAt(offset + reference.length);
			} else if (match[2]) { // [ref][]
				reference = match[2];
				const offset = (match.index || 0) + 1;
				linkStart = document.positionAt(offset);
				linkEnd = document.positionAt(offset + match[2].length);
			} else {
				continue;
			}

			try {
				const link = definitions.get(reference);
				if (link) {
					results.push(new vscode.DocumentLink(
						new vscode.Range(linkStart, linkEnd),
						vscode.Uri.parse(`command:_markdown.moveCursorToPosition?${encodeURIComponent(JSON.stringify([link.linkRange.start.line, link.linkRange.start.character]))}`)));
				}
			} catch (e) {
				// noop
			}
		}

		for (const definition of definitions.values()) {
			try {
				const linkData = parseLink(document, definition.link);
				if (linkData) {
					results.push(new vscode.DocumentLink(definition.linkRange, linkData.uri));
				}
			} catch (e) {
				// noop
			}
		}

		return results;
	}

	public static getDefinitions(text: string, document: vscode.TextDocument) {
		const out = new Map<string, { link: string, linkRange: vscode.Range }>();
		for (const match of text.matchAll(definitionPattern)) {
			const pre = match[1];
			const reference = match[2];
			const link = match[3].trim();
			const offset = (match.index || 0) + pre.length;

			if (angleBracketLinkRe.test(link)) {
				const linkStart = document.positionAt(offset + 1);
				const linkEnd = document.positionAt(offset + link.length - 1);
				out.set(reference, {
					link: link.substring(1, link.length - 1),
					linkRange: new vscode.Range(linkStart, linkEnd)
				});
			} else {
				const linkStart = document.positionAt(offset);
				const linkEnd = document.positionAt(offset + link.length);
				out.set(reference, {
					link: link,
					linkRange: new vscode.Range(linkStart, linkEnd)
				});
			}
		}
		return out;
	}
}
