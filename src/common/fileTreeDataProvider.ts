import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class FileTreeItem extends vscode.TreeItem {
  public readonly isDirectory: boolean;
  public readonly filePath: string;

  constructor(
    public readonly resourceUri: vscode.Uri,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly parent?: FileTreeItem
  ) {
    super(resourceUri, collapsibleState);
    this.filePath = resourceUri.fsPath;
    const stat = fs.statSync(this.resourceUri.fsPath);
    this.isDirectory = stat.isDirectory();
    this.tooltip = this.resourceUri.fsPath;
    this.contextValue = this.isDirectory ? "folder" : "file";
    if (!this.isDirectory) {
      this.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [this.resourceUri],
      };
    }
  }
}

export class FileTreeDataProvider
  implements
    vscode.TreeDataProvider<FileTreeItem>,
    vscode.TreeDragAndDropController<FileTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<FileTreeItem | undefined> =
    new vscode.EventEmitter<FileTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<FileTreeItem | undefined> =
    this._onDidChangeTreeData.event;

  dropMimeTypes = ["application/vnd.code.tree.fileExplorer"];
  dragMimeTypes = ["text/uri-list"];

  private rootPath: string | undefined;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  refresh(element?: FileTreeItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  // 添加 getRootPath 方法
  getRootPath(): string | undefined {
    return this.rootPath;
  }

  setRootPath(rootPath: string | undefined, context: vscode.ExtensionContext) {
    this.rootPath = rootPath;
    const config = vscode.workspace.getConfiguration("fileManager");
    config.update("rootPath", rootPath, vscode.ConfigurationTarget.Global);
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FileTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FileTreeItem): Promise<FileTreeItem[]> {
    if (!this.rootPath) {
      return Promise.resolve([]);
    }

    const targetPath = element ? element.resourceUri.fsPath : this.rootPath;

    try {
      const children = await fs.promises.readdir(targetPath);
      const items = await Promise.all(
        children.map(async (child) => {
          const resourcePath = path.join(targetPath, child);
          const stat = await fs.promises.stat(resourcePath);
          return {
            resourceUri: vscode.Uri.file(resourcePath),
            isDirectory: stat.isDirectory(),
            name: child,
          };
        })
      );

      // 按文件夹优先、名称排序
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) {
          return -1;
        }
        if (!a.isDirectory && b.isDirectory) {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });

      return items.map(
        (item) =>
          new FileTreeItem(
            item.resourceUri,
            item.isDirectory
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None,
            element
          )
      );
    } catch (err) {
      return [];
    }
  }

  async createFile(fileName: string, node?: FileTreeItem): Promise<void> {
    let folderPath: string | undefined = "";
    if (!node) {
      folderPath = this.context.globalState.get("rootPath")?.toString();
    } else {
      folderPath = node.isDirectory
        ? node.filePath
        : path.dirname(node.filePath);
    }
    if (!folderPath) {
      vscode.window.showErrorMessage("No folder selected.");
      return;
    }
    const filePath = path.join(folderPath, fileName);
    try {
      await fs.promises.writeFile(filePath, "");
      const dirNode = node?.isDirectory ? node : node?.parent;
      this.refresh(dirNode);
      if (dirNode) {
        dirNode.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      }
    } catch (err) {
      vscode.window.showErrorMessage(`创建文件失败: ${err}`);
    }
  }

  async createFolder(folderName: string, node?: FileTreeItem): Promise<void> {
    let folderPath: string | undefined = "";
    if (!node) {
      folderPath = this.context.globalState.get("rootPath")?.toString();
    } else {
      folderPath = node.isDirectory
        ? node.filePath
        : path.dirname(node.filePath);
    }
    if (!folderPath) {
      vscode.window.showErrorMessage("No folder selected.");
      return;
    }
    try {
      folderPath = path.join(folderPath, folderName);
      await fs.promises.mkdir(folderPath);
      const dirNode = node?.isDirectory ? node : node?.parent;
      this.refresh(dirNode);
      if (dirNode) {
        dirNode.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      }
    } catch (err) {
      vscode.window.showErrorMessage(`创建文件夹失败: ${err}`);
    }
  }

  async delete(node: FileTreeItem): Promise<void> {
    try {
      const stat = await fs.promises.stat(node.resourceUri.fsPath);
      if (stat.isDirectory()) {
        await fs.promises.rmdir(node.resourceUri.fsPath, { recursive: true });
      } else {
        await fs.promises.unlink(node.resourceUri.fsPath);
      }
      this.refresh(node.parent);
    } catch (err) {
      vscode.window.showErrorMessage(`删除失败: ${err}`);
    }
  }

  async rename(node: FileTreeItem, newName: string): Promise<void> {
    const oldPath = node.resourceUri.fsPath;
    const newPath = path.join(path.dirname(oldPath), newName);

    try {
      await fs.promises.rename(oldPath, newPath);
      this.refresh(node.parent);
    } catch (err) {
      vscode.window.showErrorMessage(`重命名失败: ${err}`);
    }
  }

  // 实现拖放功能
  async handleDrop(
    target: FileTreeItem | undefined,
    sources: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = sources.get("text/uri-list");
    if (!transferItem) {
      return;
    }

    const sourceUris: vscode.Uri[] = await transferItem.value;

    // 确定目标路径：如果目标是文件而非文件夹，则使用其父目录作为目标路径
    let targetPath: string | undefined;
    if (target) {
      // 检查目标是文件还是文件夹
      const isDirectory = fs.statSync(target.resourceUri.fsPath).isDirectory();
      if (isDirectory) {
        // 如果是文件夹，直接使用其路径
        targetPath = target.resourceUri.fsPath;
      } else {
        // 如果是文件，使用其父目录路径
        targetPath = path.dirname(target.resourceUri.fsPath);
        // 显示提示信息
        vscode.window.showInformationMessage(
          `文件将被放置到 ${path.basename(targetPath)} 目录中`
        );
      }
    } else {
      // 如果没有指定目标，使用根目录
      targetPath = this.rootPath;
    }

    if (!targetPath) {
      return;
    }

    for (const sourceUri of sourceUris) {
      const sourcePath = sourceUri.fsPath;
      const fileName = path.basename(sourcePath);
      const targetFilePath = path.join(targetPath, fileName);

      try {
        if (sourcePath === targetFilePath) {
          continue;
        }
        await fs.promises.rename(sourcePath, targetFilePath);
      } catch (err) {
        vscode.window.showErrorMessage(`移动文件失败: ${err}`);
      }
    }

    this.refresh();
  }

  async handleDrag(
    source: FileTreeItem[],
    treeDataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    treeDataTransfer.set(
      "text/uri-list",
      new vscode.DataTransferItem(source.map((s) => s.resourceUri))
    );
  }
}
