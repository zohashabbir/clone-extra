/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./splitview';
import { IDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter, chain } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { $, append, addClass, removeClass, toggleClass } from 'vs/base/browser/dom';
import { firstIndex } from 'vs/base/common/arrays';
import { Color, RGBA } from 'vs/base/common/color';
import { SplitView, IView } from './splitview2';

export interface IPanelOptions {
	ariaHeaderLabel?: string;
	minimumBodySize?: number;
	maximumBodySize?: number;
	expanded?: boolean;
}

export interface IPanelStyles {
	dropBackground?: Color;
}

export abstract class Panel implements IView {

	private static HEADER_SIZE = 22;

	private _expanded: boolean;
	private _headerVisible: boolean;
	private _onDidChange = new Emitter<void>();
	private _minimumBodySize: number;
	private _maximumBodySize: number;
	private ariaHeaderLabel: string;

	readonly header: HTMLElement;
	protected disposables: IDisposable[] = [];

	get minimumBodySize(): number {
		return this._minimumBodySize;
	}

	set minimumBodySize(size: number) {
		this._minimumBodySize = size;
		this._onDidChange.fire();
	}

	get maximumBodySize(): number {
		return this._maximumBodySize;
	}

	set maximumBodySize(size: number) {
		this._maximumBodySize = size;
		this._onDidChange.fire();
	}

	get minimumSize(): number {
		const headerSize = this.headerVisible ? Panel.HEADER_SIZE : 0;
		const expanded = !this.headerVisible || this.expanded;
		const minimumBodySize = expanded ? this._minimumBodySize : 0;

		return headerSize + minimumBodySize;
	}

	get maximumSize(): number {
		const headerSize = this.headerVisible ? Panel.HEADER_SIZE : 0;
		const expanded = !this.headerVisible || this.expanded;
		const maximumBodySize = expanded ? this._maximumBodySize : 0;

		return headerSize + maximumBodySize;
	}

	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(options: IPanelOptions = {}) {
		this._expanded = typeof options.expanded === 'undefined' ? true : !!options.expanded;
		this.ariaHeaderLabel = options.ariaHeaderLabel || '';
		this._minimumBodySize = typeof options.minimumBodySize === 'number' ? options.minimumBodySize : 44;
		this._maximumBodySize = typeof options.maximumBodySize === 'number' ? options.maximumBodySize : Number.POSITIVE_INFINITY;
	}

	get expanded(): boolean {
		return this._expanded;
	}

	set expanded(expanded: boolean) {
		if (this._expanded === !!expanded) {
			return;
		}

		this._expanded = !!expanded;
		this.renderHeader();
		this._onDidChange.fire();
	}

	get headerVisible(): boolean {
		return this._headerVisible;
	}

	set headerVisible(visible: boolean) {
		if (this._headerVisible === !!visible) {
			return;
		}

		this._headerVisible = !!visible;
		this.renderHeader();
		this._onDidChange.fire();
	}

	render(container: HTMLElement): void {
		const panel = append(container, $('.panel'));
		const header = append(panel, $('.panel-header'));

		header.setAttribute('tabindex', '0');
		header.setAttribute('role', 'toolbar');
		header.setAttribute('aria-label', this.ariaHeaderLabel);
		this.renderHeader();

		const onHeaderKeyDown = chain(domEvent(header, 'keydown'))
			.map(e => new StandardKeyboardEvent(e));

		onHeaderKeyDown.filter(e => e.keyCode === KeyCode.Enter || e.keyCode === KeyCode.Space)
			.event(() => this.expanded = !this.expanded, null, this.disposables);

		onHeaderKeyDown.filter(e => e.keyCode === KeyCode.LeftArrow)
			.event(() => this.expanded = false, null, this.disposables);

		onHeaderKeyDown.filter(e => e.keyCode === KeyCode.RightArrow)
			.event(() => this.expanded = true, null, this.disposables);

		domEvent(header, 'click')
			(() => this.expanded = !this.expanded, null, this.disposables);

		// TODO@Joao move this down to panelview
		// onHeaderKeyDown.filter(e => e.keyCode === KeyCode.UpArrow)
		// 	.event(focusPrevious, this, this.disposables);

		// onHeaderKeyDown.filter(e => e.keyCode === KeyCode.DownArrow)
		// 	.event(focusNext, this, this.disposables);

		const body = append(panel, $('.panel-body'));
		this.renderBody(body);
	}

	layout(size: number): void {
		const headerSize = this.headerVisible ? Panel.HEADER_SIZE : 0;
		this.layoutBody(size - headerSize);
	}

	focus(): void {
		// TODO@joao what to do
	}

	private renderHeader(): void {
		const expanded = !this.headerVisible || this.expanded;

		toggleClass(this.header, 'hidden', !this.headerVisible);
		toggleClass(this.header, 'expanded', expanded);
		this.header.setAttribute('aria-expanded', String(expanded));
	}

	protected abstract renderBody(container: HTMLElement): void;
	protected abstract layoutBody(size: number): void;

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

interface IDndContext {
	dropBackground: Color | undefined;
	draggable: PanelDraggable | null;
}

class PanelDraggable implements IDisposable {

	private static DefaultDragOverBackgroundColor = new Color(new RGBA(128, 128, 128, 0.5));

	// see https://github.com/Microsoft/vscode/issues/14470
	private dragOverCounter = 0;
	private disposables: IDisposable[] = [];

	private _onDidDrop = new Emitter<{ from: Panel, to: Panel }>();
	readonly onDidDrop = this._onDidDrop.event;

	constructor(private panel: Panel, private context: IDndContext) {
		domEvent(panel.header, 'dragstart')(this.onDragStart, this, this.disposables);
		domEvent(panel.header, 'dragenter')(this.onDragEnter, this, this.disposables);
		domEvent(panel.header, 'dragleave')(this.onDragLeave, this, this.disposables);
		domEvent(panel.header, 'dragend')(this.onDragEnd, this, this.disposables);
		domEvent(panel.header, 'drop')(this.onDrop, this, this.disposables);
	}

	private onDragStart(e: DragEvent): void {
		e.dataTransfer.effectAllowed = 'move';

		const dragImage = append(document.body, $('.monaco-panel-drag-image', {}, this.panel.header.textContent));
		e.dataTransfer.setDragImage(dragImage, -10, -10);
		setTimeout(() => document.body.removeChild(dragImage), 0);

		this.context.draggable = this;
	}

	private onDragEnter(e: DragEvent): void {
		if (!this.context.draggable || this.context.draggable === this) {
			return;
		}

		this.dragOverCounter++;
		this.renderHeader();
	}

	private onDragLeave(e: DragEvent): void {
		if (!this.context.draggable || this.context.draggable === this) {
			return;
		}

		this.dragOverCounter--;

		if (this.dragOverCounter === 0) {
			this.renderHeader();
		}
	}

	private onDragEnd(e: DragEvent): void {
		if (!this.context.draggable) {
			return;
		}

		this.dragOverCounter = 0;
		this.renderHeader();
		this.context.draggable = null;
	}

	private onDrop(e: DragEvent): void {
		if (!this.context.draggable) {
			return;
		}

		this.dragOverCounter = 0;
		this.renderHeader();

		if (this.context.draggable !== this) {
			this._onDidDrop.fire({ from: this.context.draggable.panel, to: this.panel });
		}

		this.context.draggable = null;
	}

	private renderHeader(): void {
		let backgroundColor: string = null;

		if (this.dragOverCounter > 0) {
			backgroundColor = (this.context.dropBackground || PanelDraggable.DefaultDragOverBackgroundColor).toString();
		}

		this.panel.header.style.backgroundColor = backgroundColor;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class IPanelViewOptions {
	dnd?: boolean;
}

interface IPanelItem {
	panel: Panel;
	disposable: IDisposable;
}

export class PanelView implements IDisposable {

	private dnd: boolean;
	private dndContext: IDndContext = { dropBackground: undefined, draggable: null };
	private el: HTMLElement;
	private panelItems: IPanelItem[] = [];
	private splitview: SplitView;
	private animationTimer: number | null = null;

	private _onDidDrop = new Emitter<{ from: Panel, to: Panel }>();
	readonly onDidDrop: Event<{ from: Panel, to: Panel }> = this._onDidDrop.event;

	constructor(private container: HTMLElement, options?: IPanelViewOptions) {
		this.dnd = !!options.dnd;
		this.el = append(container, $('.monaco-panel-view'));
		this.splitview = new SplitView(container);
	}

	addPanel(panel: Panel, size: number, index = this.splitview.length): void {
		const disposables: IDisposable[] = [];
		panel.onDidChange(this.setupAnimation, this, disposables);

		if (this.dnd) {
			const draggable = new PanelDraggable(panel, this.dndContext);
			disposables.push(draggable);
			draggable.onDidDrop(this._onDidDrop.fire, this._onDidDrop, disposables);
		}

		const panelItem = { panel, disposable: combinedDisposable(disposables) };

		this.panelItems.splice(index, 0, panelItem);
		this.splitview.addView(panel, size, index);
	}

	removePanel(panel: Panel): void {
		const index = firstIndex(this.panelItems, item => item.panel === panel);

		if (index === -1) {
			return;
		}

		this.splitview.removeView(index);
		const panelItem = this.panelItems.splice(index, 1)[0];
		panelItem.disposable.dispose();
	}

	movePanel(from: Panel, to: Panel): void {
		const fromIndex = firstIndex(this.panelItems, item => item.panel === from);
		const toIndex = firstIndex(this.panelItems, item => item.panel === to);

		if (fromIndex === -1 || toIndex === -1) {
			return;
		}

		this.splitview.moveView(fromIndex, toIndex);
	}

	layout(size: number): void {
		this.splitview.layout(size);
	}

	style(styles: IPanelStyles): void {
		this.dndContext.dropBackground = styles.dropBackground;
	}

	private setupAnimation(): void {
		if (typeof this.animationTimer === 'number') {
			window.clearTimeout(this.animationTimer);
		}

		addClass(this.el, 'animated');

		this.animationTimer = window.setTimeout(() => {
			this.animationTimer = null;
			removeClass(this.el, 'animated');
		}, 200);
	}

	dispose(): void {
		this.panelItems.forEach(i => i.disposable.dispose());
		this.splitview.dispose();
	}
}
