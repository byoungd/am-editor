import {
	$,
	CardEntry,
	CardInterface,
	CARD_KEY,
	CARD_VALUE_KEY,
	decodeCardValue,
	encodeCardValue,
	isEngine,
	NodeInterface,
	Plugin,
	PluginEntry,
	READY_CARD_KEY,
	sanitizeUrl,
	SchemaInterface,
} from '@aomao/engine';
import VideoComponent, { VideoValue } from './component';
import VideoUploader from './uploader';
import locales from './locales';

export default class VideoPlugin extends Plugin<{
	onBeforeRender?: (
		action: 'download' | 'query' | 'cover',
		url: string,
	) => string;
}> {
	static get pluginName() {
		return 'video';
	}

	init() {
		this.editor.language.add(locales);
		if (!isEngine(this.editor)) return;
		this.editor.on('parse:html', (node) => this.parseHtml(node));
		this.editor.on('paste:each', (child) => this.pasteHtml(child));
		this.editor.on('paste:schema', (schema: SchemaInterface) =>
			this.pasteSchema(schema),
		);
	}

	execute(
		status: 'uploading' | 'transcoding' | 'done' | 'error',
		url: string,
		name?: string,
		video_id?: string,
		cover?: string,
		size?: number,
		download?: string,
	): void {
		const value: VideoValue = {
			status,
			video_id,
			cover,
			url,
			name: name || url,
			size,
			download,
		};
		if (status === 'error') {
			value.url = '';
			value.message = url;
		}
		this.editor.card.insert('video', value);
	}

	async waiting(
		callback?: (
			name: string,
			card?: CardInterface,
			...args: any
		) => boolean | number | void,
	): Promise<void> {
		const { card } = this.editor;
		// 检测单个组件
		const check = (component: CardInterface) => {
			return (
				component.root.inEditor() &&
				(component.constructor as CardEntry).cardName ===
					VideoComponent.cardName &&
				(component as VideoComponent).getValue()?.status === 'uploading'
			);
		};
		// 找到不合格的组件
		const find = (): CardInterface | undefined => {
			return card.components.find(check);
		};
		const waitCheck = (component: CardInterface): Promise<void> => {
			let time = 60000;
			return new Promise((resolve, reject) => {
				if (callback) {
					const result = callback(
						(this.constructor as PluginEntry).pluginName,
						component,
					);
					if (result === false) {
						return reject({
							name: (this.constructor as PluginEntry).pluginName,
							card: component,
						});
					} else if (typeof result === 'number') {
						time = result;
					}
				}
				const beginTime = new Date().getTime();
				const now = new Date().getTime();
				const timeout = () => {
					if (now - beginTime >= time) return resolve();
					setTimeout(() => {
						if (check(component)) timeout();
						else resolve();
					}, 10);
				};
				timeout();
			});
		};
		return new Promise(async (resolve, reject) => {
			const component = find();
			const wait = (component: CardInterface) => {
				waitCheck(component)
					.then(() => {
						const next = find();
						if (next) wait(next);
						else resolve();
					})
					.catch(reject);
			};
			if (component) wait(component);
			else resolve();
		});
	}

	pasteSchema(schema: SchemaInterface) {
		schema.add({
			type: 'block',
			name: 'div',
			attributes: {
				'data-value': '*',
				'data-type': {
					required: true,
					value: VideoComponent.cardName,
				},
			},
		});
	}

	pasteHtml(node: NodeInterface) {
		if (!isEngine(this.editor)) return;
		if (node.isElement()) {
			const type = node.attributes('data-type');
			if (type === VideoComponent.cardName) {
				const value = node.attributes('data-value');
				const cardValue = decodeCardValue(value) as VideoValue;
				if (!cardValue.url) return;
				this.editor.card.replaceNode(
					node,
					VideoComponent.cardName,
					cardValue,
				);
				node.remove();
				return false;
			}
		}
		return true;
	}

	parseHtml(root: NodeInterface) {
		root.find(
			`[${CARD_KEY}="${VideoComponent.cardName}"],[${READY_CARD_KEY}="${VideoComponent.cardName}"]`,
		).each((cardNode) => {
			const node = $(cardNode);
			const card = this.editor.card.find(node) as VideoComponent;
			const value =
				card?.getValue() ||
				decodeCardValue(node.attributes(CARD_VALUE_KEY));
			if (value?.url && value.status === 'done') {
				const { onBeforeRender } = this.options;
				const { cover, url } = value;
				const html = `<div data-type="${
					VideoComponent.cardName
				}"  data-value="${encodeCardValue(
					value,
				)}"><video controls src="${sanitizeUrl(
					onBeforeRender ? onBeforeRender('query', url) : url,
				)}" poster="${
					!cover
						? 'none'
						: sanitizeUrl(
								onBeforeRender
									? onBeforeRender('cover', cover)
									: cover,
						  )
				}" webkit-playsinline="webkit-playsinline" playsinline="playsinline" style="outline:none;" /></div>`;
				node.empty();
				node.replaceWith($(html));
			} else node.remove();
		});
	}
}

export { VideoComponent, VideoUploader };
