import * as vscode from "vscode";
import * as CommandsBase from "../common/commandsBase";
import * as fs from "fs";
import {
  FileTreeDataProvider,
  FileTreeItem,
} from "../common/fileTreeDataProvider";
import path from "path";

// 全局变量存储 FileTreeDataProvider 实例
let fileTreeDataProvider: FileTreeDataProvider;
let treeView: vscode.TreeView<FileTreeItem>;

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
    // 注册命令：选择目录
    "wf-code-manager.selectDirectory": async () => {
      const selectedFolder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "选择目录",
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
    // 双击打开目录
    "wf-code-manager.openFile": (item: FileTreeItem) => {
      //vscode.window.showInformationMessage(`双击路径：${item.filePath}`);
      vscode.window.showTextDocument(vscode.Uri.file(item.filePath));
    },
    "wf-code-manager.newFile": async (item?: FileTreeItem) => {
      const newFileName = await vscode.window.showInputBox({
        prompt: "请输入文件名",
        placeHolder: "请输入文件名",
      });
      if (newFileName) {
        fileTreeDataProvider.createFile(newFileName, item);
      }
    },
    "wf-code-manager.newFolder": async (item: FileTreeItem) => {
      const newFolderName = await vscode.window.showInputBox({
        prompt: "请输入文件夹名称",
        placeHolder: "文件夹名称",
      });

      if (newFolderName) {
        fileTreeDataProvider.createFolder(newFolderName, item);
      }
    },
    "wf-code-manager.renameFile": async (item: FileTreeItem) => {
      const newName = await vscode.window.showInputBox({
        prompt: "请输入名称",
        value: path.basename(item.filePath),
      });
      if (newName) {
        fileTreeDataProvider.rename(item, newName);
      }
    },
    "wf-code-manager.deleteFiles": async (item: FileTreeItem) => {
      const confirm = await vscode.window.showWarningMessage(
        `是否确认删除选中的项？`,
        { modal: true },
        "确认删除"
      );
      if (confirm === "确认删除") {
        fileTreeDataProvider.delete(item);
      }
    },
    "wf-code-manager.runCode": async (item: FileTreeItem) => {
      if (!item || item.isDirectory || !item.filePath) {
        return;
      }

      const extensionId = "formulahendry.code-runner";
      // 检查 Code Runner 扩展是否已安装
      let codeRunnerExtension = vscode.extensions.getExtension(extensionId);
      if (!codeRunnerExtension) {
        // 如果扩展未安装，则提示用户安装
        const install = await vscode.window.showInformationMessage(
          `扩展 Code Runner 未安装，是否立即安装？`,
          "是",
          "否"
        );
        if (install === "是") {
          // 安装扩展
          await vscode.commands.executeCommand(
            "workbench.extensions.installExtension",
            extensionId
          );
          vscode.window.showInformationMessage(`扩展 Code Runner 已安装。`);
        } else {
          return;
        }
      }

      // // 确保 Code Runner 扩展已激活
      // codeRunnerExtension = vscode.extensions.getExtension(extensionId);
      // if (!codeRunnerExtension.isActive) {
      //   await codeRunnerExtension.activate();
      // }

      // 调用 Code Runner 的 Run Code 命令，并传递文件路径
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
        vscode.window.showErrorMessage("没有选择目录.");
        return;
      }

      // 创建新的终端
      vscode.commands
        .executeCommand("workbench.action.terminal.new")
        .then(() => {
          // 获取终端的当前活动实例
          const terminal = vscode.window.activeTerminal;
          if (terminal) {
            // 在终端中切换到文件或文件夹的目录
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
