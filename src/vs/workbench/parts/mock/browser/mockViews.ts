/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import dom = require('vs/base/browser/dom');
import actions = require('vs/base/common/actions');
import splitview = require('vs/base/browser/ui/splitview/splitview');
import debug = require('vs/workbench/parts/debug/common/debug');
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

const $ = dom.emmet;

export class InformationView extends splitview.CollapsibleView {

	private static MEMENTO = 'informationview.memento';
	private bodyContainer: HTMLElement;
	private toDispose: lifecycle.IDisposable[];
	private customEventListener: lifecycle.IDisposable;

	// the view's model:
	private debugSession: debug.IRawDebugSession;
	private debugState: debug.State;
	private stackFrame: debug.IStackFrame;
	private currentFile: string;
	private currentLine: number;
	private hoverExpression: number;


	constructor(actionRunner: actions.IActionRunner, private settings: any,
		@ITelemetryService private telemetryService: ITelemetryService,
		@debug.IDebugService private debugService: debug.IDebugService
	) {
		super({
			minimumSize: 2 * 22,
			initialState: !!settings[InformationView.MEMENTO] ? splitview.CollapsibleState.COLLAPSED : splitview.CollapsibleState.EXPANDED,
			ariaHeaderLabel: nls.localize('information', "Information")
		});
		this.toDispose = [];

		// the following 'wireing' should probably go into a separate lifcycle hook.
		this.debugState = this.debugService.getState();

		const viewModel = this.debugService.getViewModel();
		this.toDispose.push(viewModel.addListener2(debug.ViewModelEvents.FOCUSED_STACK_FRAME_UPDATED, () => this.onFocusedStackFrameUpdated()));

		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => this.onDebugStateChange()));
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = dom.append(container, $('div.title'));
		const titleSpan = dom.append(titleDiv, $('span.label'));
		titleSpan.textContent = nls.localize('information', "Information");
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'mock-information');
		this.bodyContainer = container;
		this.renderContent();
	}

	/**
	 * remember the selected stackframe's name in the view model
	 */
	private onFocusedStackFrameUpdated(): void {
		this.stackFrame = this.debugService.getViewModel().getFocusedStackFrame();
		this.renderContent();
	}

	private onDebugStateChange(): void {

		const session = this.debugService.getActiveSession();
		this.debugState = this.debugService.getState();
		if (this.debugState === debug.State.Stopped) {

			// we need an easier way to track lifetime of a session
			if (!this.debugSession && session) {
				// new session
				this.debugSession = session;
				// listen for our custom event
				this.customEventListener = session.addListener2('custom', (event: DebugProtocol.Event) => this.onCustomEvent(event) );
			}

			if (session) {
				this.stackFrame = this.debugService.getViewModel().getFocusedStackFrame();
				session.custom('infoRequest', {}).then(response => {
					this.currentFile = response.body.currentFile;
					this.currentLine = response.body.currentLine;
					this.renderContent();
				});
			}
		} else {

			// we need an easier way to track lifetime of a session
			if (this.debugSession && !session) {
				// session gone
				this.debugSession = undefined;
				// deregister for our custom event
				this.customEventListener.dispose();
			}

			this.stackFrame = undefined;
			this.currentFile = undefined;
			this.currentLine = undefined;
			this.hoverExpression = undefined;
			this.renderContent();
		}
	}

	/**
	 * Custom event contains word under hover.
	 * Remember that.
	 */
	private onCustomEvent(event: DebugProtocol.Event): void {
		this.hoverExpression = event.body.hoverExpression;
		this.renderContent();
	}

	private renderContent(): void {

		let content = `state: ${debug.State[this.debugState]}`;
		if (this.stackFrame) {
			content += `<br>frame: ${this.stackFrame.name}`;
		}
		if (this.currentFile) {
			content += `<br>file: ${this.currentFile}<br>line: ${this.currentLine}`;
		}
		if (this.hoverExpression) {
			content += `<br>hover: ${this.hoverExpression}`;
		}
		this.bodyContainer.innerHTML = content;
	}

	public shutdown(): void {
		this.settings[InformationView.MEMENTO] = (this.state === splitview.CollapsibleState.COLLAPSED);
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}
