import {
	arrayBufferToBase64,
	base64ToArrayBuffer,
	Plugin,
	setIcon,
} from "obsidian";
import * as Y from "yjs";
import DiffMatchPatch from "diff-match-patch";
import { WebsocketProvider } from "y-websocket";

export default class Aerosol extends Plugin {
	doc: Y.Doc;
	statusBarText: HTMLElement;
	dmp: DiffMatchPatch = new DiffMatchPatch();
	wsProvider: WebsocketProvider;

	async onload() {
		// init
		this.loadDoc();
		this.wsProvider = new WebsocketProvider(
			"ws://8.tcp.ngrok.io:12568",
			"aerosol-room",
			this.doc
		);

		this.registerEvent(
			this.doc.on("update", (_) => {
				console.log("incoming update, applying changes");

				const filesMap = this.doc.getMap<Y.Map<any>>("files");
				filesMap.forEach(async (fileMap) => {
					const path = fileMap.get("path");
					const content: Y.Text = fileMap.get("content");
					const existingFile = this.app.vault.getFileByPath(path);
					if (existingFile) {
						const current = await this.app.vault.read(existingFile);
						if (current === content.toString()) return; // no change
						// update existing file
						await this.app.vault.modify(
							existingFile,
							content.toString()
						);
					} else {
						await this.app.vault.create(path, content.toString());
					}
				});

				const trackedFiles = new Set();
				filesMap.forEach((fileMap) => {
					trackedFiles.add(fileMap.get("path"));
				});

				this.app.vault.getFiles().forEach(async (file) => {
					if (!trackedFiles.has(file.path)) {
						await this.app.vault.delete(file);
					}
				});
			})
		);

		this.registerEvent(
			this.wsProvider.on("status", this.updateConnectionStatus)
		);

		// add status bar text
		this.statusBarText = this.addStatusBarItem();
		this.statusBarText.setText("Idle");

		// add status bar icon
		const statusBarIcon = this.addStatusBarItem();
		setIcon(statusBarIcon, "refresh-cw-off");

		// registering of sync events
		this.registerEvent(
			this.app.vault.on("create", async (file) => {
				this.statusBarText.setText("create " + file.path);
				this.doc.transact(() => {
					// get the file map
					const map = this.doc.getMap<Y.Map<any>>("files");

					// check if file already exists in map
					let alreadyTracked = false;
					map.forEach((v, k) => {
						if (v.get("path") === file.path) {
							alreadyTracked = true;
							return; // file already exists, do nothing
						}
					});
					if (alreadyTracked) return;

					// create a nested map for the file
					const fileMap = new Y.Map();
					fileMap.set("path", file.path);
					fileMap.set("content", new Y.Text());

					// add the new entry with a random id
					map.set(crypto.randomUUID(), fileMap);
				});
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", async (file) => {
				this.statusBarText.setText("delete " + file.path);
				this.doc.transact(() => {
					// get the file map
					const map = this.doc.getMap<Y.Map<any>>("files");

					// delete the entry with the matching path
					map.forEach((v, k) => {
						if (v.get("path") === file.path) {
							map.delete(k);
						}
					});
				});
			})
		);

		// // Currently not used, as changes are tracked via editor-change event
		// this.registerEvent(
		// 	this.app.vault.on("modify", async (file) => {
		// 		this.statusBarText.setText("modify " + file.path);
		// 	})
		// );

		this.registerEvent(
			this.app.vault.on("rename", async (file, oldPath) => {
				this.statusBarText.setText("rename " + file.path);
				this.doc.transact(() => {
					// get the file map
					const map = this.doc.getMap<Y.Map<any>>("files");

					// update the path in the map, while keeping content
					map.forEach((v, k) => {
						if (v.get("path") === oldPath) {
							v.set("path", file.path);
						}
					});
				});
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-change", (editor, info) => {
				// get the file map
				const map = this.doc.getMap<Y.Map<any>>("files");

				// find corresponding ytext
				let ytext: Y.Text | null = null;
				for (const v of map.values()) {
					if (v.get("path") === info.file?.path) {
						ytext = v.get("content");
					}
				}

				if (ytext == null) return;

				// calculate diffs
				const newValue = editor.getValue();
				const oldValue = ytext.toString();

				const diffs = this.dmp.diff_main(oldValue, newValue);
				this.dmp.diff_cleanupEfficiency(diffs);

				// apply diffs
				this.doc.transact(() => {
					let index = 0;
					for (const [op, text] of diffs) {
						if (op === 0) {
							// equal, skip
							index += text.length;
						} else if (op === -1) {
							// deletion
							ytext.delete(index, text.length);
							// no index change because deletion removes characters at current position
						} else if (op === 1) {
							// insertion
							ytext.insert(index, text);
							index += text.length; // move past inserted text
						}
					}
				});
			})
		);
	}

	async onunload() {
		this.saveDoc();
	}

	loadDoc() {
		this.doc = new Y.Doc();
		const stored = this.app.loadLocalStorage("ydoc");
		if (stored) {
			const update = new Uint8Array(base64ToArrayBuffer(stored));
			Y.applyUpdate(this.doc, update);
		}
	}
	saveDoc() {
		const update = Y.encodeStateAsUpdate(this.doc);
		this.app.saveLocalStorage(
			"ydoc",
			arrayBufferToBase64(update.buffer as ArrayBuffer)
		);
	}

	updateConnectionStatus(event: {
		status: "connected" | "disconnected" | "connecting";
	}) {
		console.log("Connection status: " + event.status);
	}
}
