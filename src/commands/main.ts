import * as vscode from "vscode";
import * as CommandsBase from "../common/commandsBase";
import {
  FileTreeDataProvider,
  FileTreeItem,
} from "../common/fileTreeDataProvider";
import path from "path";

// 全局变量存储 FileTreeDataProvider 实例
let fileTreeDataProvider: FileTreeDataProvider;
let treeView: vscode.TreeView<FileTreeItem>;
const l10n = vscode.l10n;

export function activate(context: vscode.ExtensionContext) {
  fileTreeDataProvider = new FileTreeDataProvider(context);
  treeView = vscode.window.createTreeView("wf-code-manager", {
    treeDataProvider: fileTreeDataProvider,
    dragAndDropController: fileTreeDataProvider,
    canSelectMany: true,
  });

  // 读取保存的根目录
  const savedRootPath = context.globalState.get("rootPath")?.toString();
  if (savedRootPath) {
    fileTreeDataProvider.setRootPath(savedRootPath, context);
  }

  CommandsBase.register(context, {
    "wf-code-manager.selectDirectory": async () => {
      const selectedFolder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: l10n.t("Select Directory"),
      });

      if (selectedFolder && selectedFolder.length > 0) {
        const rootPath = selectedFolder[0].fsPath;
        fileTreeDataProvider.setRootPath(rootPath, context);

        // 保存根目录到全局状态
        context.globalState.update("rootPath", rootPath);
      }
    },
    "wf-code-manager.refreshTreeView": async () => {
      if (fileTreeDataProvider) {
        fileTreeDataProvider.refresh();
      }
    },
    "wf-code-manager.openFile": (item: FileTreeItem) => {
      vscode.window.showTextDocument(vscode.Uri.file(item.filePath));
    },
    "wf-code-manager.newFile": async (item?: FileTreeItem) => {
      const newFileName = await vscode.window.showInputBox({
        prompt: l10n.t("Enter file name"),
        placeHolder: l10n.t("Enter file name"),
      });
      if (newFileName) {
        fileTreeDataProvider.createFile(newFileName, item);
      }
    },
    "wf-code-manager.newFolder": async (item: FileTreeItem) => {
      const newFolderName = await vscode.window.showInputBox({
        prompt: l10n.t("Enter folder name"),
        placeHolder: l10n.t("Folder name"),
      });

      if (newFolderName) {
        fileTreeDataProvider.createFolder(newFolderName, item);
      }
    },
    "wf-code-manager.renameFile": async (item: FileTreeItem) => {
      const newName = await vscode.window.showInputBox({
        prompt: l10n.t("Enter name"),
        value: path.basename(item.filePath),
      });
      if (newName) {
        fileTreeDataProvider.rename(item, newName);
      }
    },
    "wf-code-manager.deleteFiles": async (item: FileTreeItem) => {
      const confirm = await vscode.window.showWarningMessage(
        l10n.t("Are you sure you want to delete the selected item?"),
        { modal: true },
        l10n.t("Confirm Delete")
      );
      if (confirm === l10n.t("Confirm Delete")) {
        fileTreeDataProvider.delete(item);
      }
    },
    "wf-code-manager.runCode": async (item: FileTreeItem) => {
      if (!item || item.isDirectory || !item.filePath) {
        return;
      }

      const extensionId = "formulahendry.code-runner";
      let codeRunnerExtension = vscode.extensions.getExtension(extensionId);
      if (!codeRunnerExtension) {
        const install = await vscode.window.showInformationMessage(
          l10n.t(
            "The Code Runner extension is not installed. Do you want to install it now?"
          ),
          l10n.t("Yes"),
          l10n.t("No")
        );
        if (install === l10n.t("Yes")) {
          await vscode.commands.executeCommand(
            "workbench.extensions.installExtension",
            extensionId
          );
          vscode.window.showInformationMessage(
            l10n.t("The Code Runner extension has been installed.")
          );
        } else {
          return;
        }
      }

      await vscode.commands.executeCommand(
        "code-runner.run",
        vscode.Uri.file(item.filePath)
      );
    },
    "wf-code-manager.revealInExplorer": (item: FileTreeItem) => {
      if (item && item.filePath) {
        vscode.commands.executeCommand(
          "revealFileInOS",
          vscode.Uri.file(item.filePath)
        );
      }
    },
    "wf-code-manager.openTerminalAtFile": (item: FileTreeItem) => {
      let folderPath: string | undefined = "";
      if (!item) {
        folderPath = context.globalState.get("rootPath")?.toString();
      } else {
        folderPath = item.isDirectory
          ? item.filePath
          : path.dirname(item.filePath);
      }
      if (!folderPath) {
        vscode.window.showErrorMessage(l10n.t("No folder selected."));
        return;
      }

      vscode.commands
        .executeCommand("workbench.action.terminal.new")
        .then(() => {
          const terminal = vscode.window.activeTerminal;
          if (terminal) {
            terminal.sendText(`cd "${folderPath}"`);
          }
        });
    },
    "wf-code-manager.openInNewWindow": (item: FileTreeItem) => {
      vscode.commands.executeCommand(
        "vscode.openFolder",
        item.resourceUri,
        true
      );
    },
    "wf-code-manager.copyPath": (item: FileTreeItem) => {
      vscode.env.clipboard.writeText(item.filePath);
    },
  });
}
