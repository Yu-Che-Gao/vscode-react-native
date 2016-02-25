// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {TelemetryHelper} from "../common/telemetryHelper";
import {Telemetry} from "../common/telemetry";
import {Log} from "../common/Log";
import {OutputChannel} from "vscode";

/* This class should we used for each entry point of the code, so we handle telemetry and error reporting properly */
export class EntryPoint {
    private outputChannel: OutputChannel;

    constructor(outputChannel?: OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /* This method should wrap any async entry points to the code, so we handle telemetry and error reporting properly */
    public runCode(taskName: string, errorDescription: string, codeToRun: () => Q.Promise<void> | void, areErrorsFatal: boolean): void {
        return this.handleErrors(errorDescription, TelemetryHelper.generate(taskName, codeToRun), /*areErrorsFatal*/ areErrorsFatal);
    }

    /* This method should wrap the entry point of the whole app, so we handle telemetry and error reporting properly */
    public runApp(appName: string, getAppVersion: () => string, errorDescription: string, codeToRun: () => Q.Promise<void>): void {
        const telemetryErrorDescription = `${errorDescription}. Couldn't initialize telemetry`;
        try { // try-catch for sync errors in init telemetry
            return this.handleErrors(telemetryErrorDescription, // handleErrors for async errors in init telemetry
                Telemetry.init("react-native", getAppVersion(), true).then(() =>
                    // After telemetry is initialized, we run the code. Errors in this main path are fatal so we rethrow them
                    this.runCode(appName, errorDescription, codeToRun, /*areErrorsFatal*/ true)), /*areErrorsFatal*/ true);
        } catch (error) {
            Log.logError(telemetryErrorDescription, error, this.outputChannel, /*logStack*/ false); // Print the error and re-throw the exception
            throw error;
        }
    }

    private handleErrors(errorDescription: string, codeToRun: Q.Promise<void>, areErrorsFatal: boolean): void {
        const isDebugeedProcess = !this.outputChannel;
        codeToRun.done(() => { }, reason => {
            const shouldLogStack = !areErrorsFatal || isDebugeedProcess;
            Log.logError(errorDescription, reason, this.outputChannel, /*logStack*/ shouldLogStack);
            if (areErrorsFatal) {
                /* The process is likely going to exit if errors are fatal, so we first
                send the telemetry, and then we exit or rethrow the exception */
                Telemetry.sendPendingData().finally(() => {
                    if (isDebugeedProcess) {
                        /* HACK: For the debugee process we don't want to throw an exception because the debugger
                                 will appear to the user if he turned on the VS Code uncaught exceptions feature. */
                        process.exit(1);
                    } else {
                        throw reason;
                    }
                });
            }
        });
    }
}