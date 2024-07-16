/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { getReplView } from 'vs/workbench/contrib/debug/browser/repl';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class RunAndDebugAccessibilityHelp implements IAccessibleViewImplentation {
	priority = 120;
	name = 'runAndDebugHelp';
	when = ContextKeyExpr.equals('activeViewlet', 'workbench.view.debug');
	type: AccessibleViewType = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const commandService = accessor.get(ICommandService);
		const replView = getReplView(viewsService);
		if (!replView) {
			return undefined;
		}
		return new RunAndDebugAccessibilityHelpProvider(commandService);
	}
}

class RunAndDebugAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	public readonly id = AccessibleViewProviderId.RunAndDebug;
	public readonly verbositySettingKey = AccessibilityVerbositySettingId.Debug;
	public readonly options = { type: AccessibleViewType.Help };
	constructor(@ICommandService private readonly _commandService: ICommandService) {
		super();
	}

	public onClose(): void {
		this._commandService.executeCommand('workbench.view.debug');
	}

	public provideContent(): string {
		return [
			localize('debug.showRunAndDebug', "The Show Run and Debug view command{0} will open the current view.", '<keybinding:workbench.view.debug>'),
			localize('debug.startDebugging', "The Debug: Start Debugging command{0} will start a debug session.", '<workbench.action.debug.start>'),
			localize('onceDebugging', "Once debugging, the following commands will be available:"),
			localize('debug.continue', "- Debug: Continue command{0} will continue execution until the next breakpoint.", '<keybinding:workbench.action.debug.continue>'),
			localize('debug.stepInto', "- Debug: Step Into command{0} will step into the next function call.", '<keybinding:workbench.action.debug.stepInto>'),
			localize('debug.stepOver', "- Debug: Step Over command{0} will step over the current function call.", '<keybinding:workbench.action.debug.stepOver>'),
			localize('debug.stepOut', "- Debug: Step Out command{0} will step out of the current function call.", '<keybinding:workbench.action.debug.stepOut>'),
			localize('debug.views', 'The debug viewlet is comprised of several views that can be focused with the following commands or navigated to via arrow keys:'),
			localize('debug.focusBreakpoints', "- Debug: Focus Breakpoints View command{0} will focus the breakpoints view.", '<keybinding:workbench.debug.action.focusBreakpointsView>'),
			localize('debug.focusCallStack', "- Debug: Focus Call Stack View command{0} will focus the call stack view.", '<keybinding:workbench.debug.action.focusCallStackView>'),
			localize('debug.focusVariables', "- Debug: Focus Variables View command{0} will focus the variables view.", '<keybinding:workbench.debug.action.focusVariablesView>'),
			localize('debug.focusWatch', "- Debug: Focus Watch View command{0} will focus the watch view.", '<keybinding:workbench.debug.action.focusWatchView>'),
			localize('debug.help', "The debug console is a REPL (Read-Eval-Print-Loop) that allows you to evaluate expressions and run commands and can be focused with{0}.", '<keybinding:workbench.panel.repl.view.focus'),
		].join('\n');
	}
}

