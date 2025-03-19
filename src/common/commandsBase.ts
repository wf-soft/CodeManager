import * as vscode from "vscode";
export type Dictionary<T = any> = {
  [key: string]: T;
};
export function register(
  context: vscode.ExtensionContext,
  commands: Dictionary<(...args: any) => void>
) {
  const subscriptions = context.subscriptions;
  for (const [command, callback] of Object.entries(commands)) {
    subscriptions.push(vscode.commands.registerCommand(command, callback));
  }
}
