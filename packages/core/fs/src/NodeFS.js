// @flow
import type {ReadStream, Stats} from 'fs';
import type {Writable} from 'stream';
import type {FileOptions, FileSystem} from './types';
import type {FilePath} from '@parcel/types';
import type {
  Event,
  Options as WatcherOptions,
  AsyncSubscription,
} from '@parcel/watcher';

import fs from 'graceful-fs';
import ncp from 'ncp';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import {promisify} from '@parcel/utils';
import {registerSerializableClass} from '@parcel/core';
import fsWriteStreamAtomic from '@parcel/fs-write-stream-atomic';
import watcher from '@parcel/watcher';
import {
  findAncestorFile,
  findNodeModule,
  findFirstFile,
} from '@parcel/fs-search';
import packageJSON from '../package.json';

// Most of this can go away once we only support Node 10+, which includes
// require('fs').promises

const realpath = promisify(
  process.platform === 'win32' ? fs.realpath : fs.realpath.native,
);

export class NodeFS implements FileSystem {
  readFile: any = promisify(fs.readFile);
  copyFile: any = promisify(fs.copyFile);
  stat: any = promisify(fs.stat);
  readdir: any = promisify(fs.readdir);
  unlink: any = promisify(fs.unlink);
  utimes: any = promisify(fs.utimes);
  mkdirp: any = promisify(mkdirp);
  rimraf: any = promisify(rimraf);
  ncp: any = promisify(ncp);
  createReadStream: (path: string, options?: any) => ReadStream =
    fs.createReadStream;
  cwd: () => string = process.cwd;
  chdir: (directory: string) => void = process.chdir;

  statSync: (path: string) => Stats = fs.statSync;
  realpathSync: (path: string, cache?: any) => string =
    process.platform === 'win32' ? fs.realpathSync : fs.realpathSync.native;
  existsSync: (path: string) => boolean = fs.existsSync;
  readdirSync: any = (fs.readdirSync: any);
  findAncestorFile: any = findAncestorFile;
  findNodeModule: any = findNodeModule;
  findFirstFile: any = findFirstFile;

  createWriteStream(filePath: string, options: any): Writable {
    return fsWriteStreamAtomic(filePath, options);
  }

  async writeFile(
    filePath: FilePath,
    contents: Buffer | string,
    options: ?FileOptions,
  ): Promise<void> {
    let tmpFilePath = getTempFilePath(filePath);
    await fs.promises.writeFile(
      tmpFilePath,
      contents,
      // $FlowFixMe
      options,
    );
    await fs.promises.rename(tmpFilePath, filePath);
  }

  readFileSync(filePath: FilePath, encoding?: buffer$Encoding): any {
    if (encoding != null) {
      return fs.readFileSync(filePath, encoding);
    }
    return fs.readFileSync(filePath);
  }

  async realpath(originalPath: string): Promise<string> {
    try {
      return await realpath(originalPath, 'utf8');
    } catch (e) {
      // do nothing
    }

    return originalPath;
  }

  exists(filePath: FilePath): Promise<boolean> {
    return new Promise(resolve => {
      fs.exists(filePath, resolve);
    });
  }

  watch(
    dir: FilePath,
    fn: (err: ?Error, events: Array<Event>) => mixed,
    opts: WatcherOptions,
  ): Promise<AsyncSubscription> {
    return watcher.subscribe(dir, fn, opts);
  }

  getEventsSince(
    dir: FilePath,
    snapshot: FilePath,
    opts: WatcherOptions,
  ): Promise<Array<Event>> {
    return watcher.getEventsSince(dir, snapshot, opts);
  }

  async writeSnapshot(
    dir: FilePath,
    snapshot: FilePath,
    opts: WatcherOptions,
  ): Promise<void> {
    await watcher.writeSnapshot(dir, snapshot, opts);
  }

  static deserialize(): NodeFS {
    return new NodeFS();
  }

  serialize(): null {
    return null;
  }
}

registerSerializableClass(`${packageJSON.version}:NodeFS`, NodeFS);

let writeStreamCalls = 0;

let threadId;
try {
  ({threadId} = require('worker_threads'));
} catch {
  //
}

// Generate a temporary file path used for atomic writing of files.
function getTempFilePath(filePath: FilePath) {
  writeStreamCalls = writeStreamCalls % Number.MAX_SAFE_INTEGER;
  return (
    filePath +
    '.' +
    process.pid +
    (threadId != null ? '.' + threadId : '') +
    '.' +
    (writeStreamCalls++).toString(36)
  );
}
