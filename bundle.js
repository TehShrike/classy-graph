(function () {
	'use strict';

	function noop() {}

	function assign(tar, src) {
		for (var k in src) tar[k] = src[k];
		return tar;
	}

	function callAfter(fn, i) {
		if (i === 0) fn();
		return () => {
			if (!--i) fn();
		};
	}

	function run(fn) {
		fn();
	}

	function append(target, node) {
		target.appendChild(node);
	}

	function insert(target, node, anchor) {
		target.insertBefore(node, anchor);
	}

	function detachNode(node) {
		node.parentNode.removeChild(node);
	}

	function destroyEach(iterations, detach) {
		for (var i = 0; i < iterations.length; i += 1) {
			if (iterations[i]) iterations[i].d(detach);
		}
	}

	function createElement(name) {
		return document.createElement(name);
	}

	function createSvgElement(name) {
		return document.createElementNS('http://www.w3.org/2000/svg', name);
	}

	function createText(data) {
		return document.createTextNode(data);
	}

	function createComment() {
		return document.createComment('');
	}

	function addListener(node, event, handler) {
		node.addEventListener(event, handler, false);
	}

	function removeListener(node, event, handler) {
		node.removeEventListener(event, handler, false);
	}

	function setAttribute(node, attribute, value) {
		node.setAttribute(attribute, value);
	}

	function setData(text, data) {
		text.data = '' + data;
	}

	function setStyle(node, key, value) {
		node.style.setProperty(key, value);
	}

	function linear(t) {
		return t;
	}

	function generateRule({ a, b, delta, duration }, ease, fn) {
		const step = 16.666 / duration;
		let keyframes = '{\n';

		for (let p = 0; p <= 1; p += step) {
			const t = a + delta * ease(p);
			keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
		}

		return keyframes + `100% {${fn(b, 1 - b)}}\n}`;
	}

	// https://github.com/darkskyapp/string-hash/blob/master/index.js
	function hash(str) {
		let hash = 5381;
		let i = str.length;

		while (i--) hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
		return hash >>> 0;
	}

	function wrapTransition(component, node, fn, params, intro) {
		let obj = fn.call(component, node, params);
		let duration;
		let ease;
		let cssText;

		let initialised = false;

		return {
			t: intro ? 0 : 1,
			running: false,
			program: null,
			pending: null,

			run(b, callback) {
				if (typeof obj === 'function') {
					transitionManager.wait().then(() => {
						obj = obj();
						this._run(b, callback);
					});
				} else {
					this._run(b, callback);
				}
			},

			_run(b, callback) {
				duration = obj.duration || 300;
				ease = obj.easing || linear;

				const program = {
					start: window.performance.now() + (obj.delay || 0),
					b,
					callback: callback || noop
				};

				if (intro && !initialised) {
					if (obj.css && obj.delay) {
						cssText = node.style.cssText;
						node.style.cssText += obj.css(0, 1);
					}

					if (obj.tick) obj.tick(0, 1);
					initialised = true;
				}

				if (!b) {
					program.group = outros.current;
					outros.current.remaining += 1;
				}

				if (obj.delay) {
					this.pending = program;
				} else {
					this.start(program);
				}

				if (!this.running) {
					this.running = true;
					transitionManager.add(this);
				}
			},

			start(program) {
				component.fire(`${program.b ? 'intro' : 'outro'}.start`, { node });

				program.a = this.t;
				program.delta = program.b - program.a;
				program.duration = duration * Math.abs(program.b - program.a);
				program.end = program.start + program.duration;

				if (obj.css) {
					if (obj.delay) node.style.cssText = cssText;

					const rule = generateRule(program, ease, obj.css);
					transitionManager.addRule(rule, program.name = '__svelte_' + hash(rule));

					node.style.animation = (node.style.animation || '')
						.split(', ')
						.filter(anim => anim && (program.delta < 0 || !/__svelte/.test(anim)))
						.concat(`${program.name} ${program.duration}ms linear 1 forwards`)
						.join(', ');
				}

				this.program = program;
				this.pending = null;
			},

			update(now) {
				const program = this.program;
				if (!program) return;

				const p = now - program.start;
				this.t = program.a + program.delta * ease(p / program.duration);
				if (obj.tick) obj.tick(this.t, 1 - this.t);
			},

			done() {
				const program = this.program;
				this.t = program.b;

				if (obj.tick) obj.tick(this.t, 1 - this.t);

				component.fire(`${program.b ? 'intro' : 'outro'}.end`, { node });

				if (!program.b && !program.invalidated) {
					program.group.callbacks.push(() => {
						program.callback();
						if (obj.css) transitionManager.deleteRule(node, program.name);
					});

					if (--program.group.remaining === 0) {
						program.group.callbacks.forEach(run);
					}
				} else {
					if (obj.css) transitionManager.deleteRule(node, program.name);
				}

				this.running = !!this.pending;
			},

			abort(reset) {
				if (this.program) {
					if (reset && obj.tick) obj.tick(1, 0);
					if (obj.css) transitionManager.deleteRule(node, this.program.name);
					this.program = this.pending = null;
					this.running = false;
				}
			},

			invalidate() {
				if (this.program) {
					this.program.invalidated = true;
				}
			}
		};
	}

	let outros = {};

	function groupOutros() {
		outros.current = {
			remaining: 0,
			callbacks: []
		};
	}

	var transitionManager = {
		running: false,
		transitions: [],
		bound: null,
		stylesheet: null,
		activeRules: {},
		promise: null,

		add(transition) {
			this.transitions.push(transition);

			if (!this.running) {
				this.running = true;
				requestAnimationFrame(this.bound || (this.bound = this.next.bind(this)));
			}
		},

		addRule(rule, name) {
			if (!this.stylesheet) {
				const style = createElement('style');
				document.head.appendChild(style);
				transitionManager.stylesheet = style.sheet;
			}

			if (!this.activeRules[name]) {
				this.activeRules[name] = true;
				this.stylesheet.insertRule(`@keyframes ${name} ${rule}`, this.stylesheet.cssRules.length);
			}
		},

		next() {
			this.running = false;

			const now = window.performance.now();
			let i = this.transitions.length;

			while (i--) {
				const transition = this.transitions[i];

				if (transition.program && now >= transition.program.end) {
					transition.done();
				}

				if (transition.pending && now >= transition.pending.start) {
					transition.start(transition.pending);
				}

				if (transition.running) {
					transition.update(now);
					this.running = true;
				} else if (!transition.pending) {
					this.transitions.splice(i, 1);
				}
			}

			if (this.running) {
				requestAnimationFrame(this.bound);
			} else if (this.stylesheet) {
				let i = this.stylesheet.cssRules.length;
				while (i--) this.stylesheet.deleteRule(i);
				this.activeRules = {};
			}
		},

		deleteRule(node, name) {
			node.style.animation = node.style.animation
				.split(', ')
				.filter(anim => anim && anim.indexOf(name) === -1)
				.join(', ');
		},

		wait() {
			if (!transitionManager.promise) {
				transitionManager.promise = Promise.resolve();
				transitionManager.promise.then(() => {
					transitionManager.promise = null;
				});
			}

			return transitionManager.promise;
		}
	};

	function blankObject() {
		return Object.create(null);
	}

	function destroy(detach) {
		this.destroy = noop;
		this.fire('destroy');
		this.set = noop;

		this._fragment.d(detach !== false);
		this._fragment = null;
		this._state = {};
	}

	function _differs(a, b) {
		return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
	}

	function fire(eventName, data) {
		var handlers =
			eventName in this._handlers && this._handlers[eventName].slice();
		if (!handlers) return;

		for (var i = 0; i < handlers.length; i += 1) {
			var handler = handlers[i];

			if (!handler.__calling) {
				try {
					handler.__calling = true;
					handler.call(this, data);
				} finally {
					handler.__calling = false;
				}
			}
		}
	}

	function flush(component) {
		component._lock = true;
		callAll(component._beforecreate);
		callAll(component._oncreate);
		callAll(component._aftercreate);
		component._lock = false;
	}

	function get() {
		return this._state;
	}

	function init(component, options) {
		component._handlers = blankObject();
		component._slots = blankObject();
		component._bind = options._bind;
		component._staged = {};

		component.options = options;
		component.root = options.root || component;
		component.store = options.store || component.root.store;

		if (!options.root) {
			component._beforecreate = [];
			component._oncreate = [];
			component._aftercreate = [];
		}
	}

	function on(eventName, handler) {
		var handlers = this._handlers[eventName] || (this._handlers[eventName] = []);
		handlers.push(handler);

		return {
			cancel: function() {
				var index = handlers.indexOf(handler);
				if (~index) handlers.splice(index, 1);
			}
		};
	}

	function set(newState) {
		this._set(assign({}, newState));
		if (this.root._lock) return;
		flush(this.root);
	}

	function _set(newState) {
		var oldState = this._state,
			changed = {},
			dirty = false;

		newState = assign(this._staged, newState);
		this._staged = {};

		for (var key in newState) {
			if (this._differs(newState[key], oldState[key])) changed[key] = dirty = true;
		}
		if (!dirty) return;

		this._state = assign(assign({}, oldState), newState);
		this._recompute(changed, this._state);
		if (this._bind) this._bind(changed, this._state);

		if (this._fragment) {
			this.fire("state", { changed: changed, current: this._state, previous: oldState });
			this._fragment.p(changed, this._state);
			this.fire("update", { changed: changed, current: this._state, previous: oldState });
		}
	}

	function _stage(newState) {
		assign(this._staged, newState);
	}

	function callAll(fns) {
		while (fns && fns.length) fns.shift()();
	}

	function _mount(target, anchor) {
		this._fragment[this._fragment.i ? 'i' : 'm'](target, anchor || null);
	}

	var proto = {
		destroy,
		get,
		fire,
		on,
		set,
		_recompute: noop,
		_set,
		_stage,
		_mount,
		_differs
	};

	function fade ( node, ref ) {
		var delay = ref.delay; if ( delay === void 0 ) delay = 0;
		var duration = ref.duration; if ( duration === void 0 ) duration = 400;

		var o = +getComputedStyle( node ).opacity;

		return {
			delay: delay,
			duration: duration,
			css: function (t) { return ("opacity: " + (t * o)); }
		};
	}

	/* ScatterGraph.html generated by Svelte v2.13.5 */

	const max = (maybeNull, number) => maybeNull === null ? number : Math.max(maybeNull, number);
	const min = (maybeNull, number) => maybeNull === null ? number : Math.min(maybeNull, number);

	const identity = value => value;
	const flatten = ary => [].concat(...ary);

	const overlapsY = (svgElement, y) => {
		const labelBox = svgElement.getBBox();
		return (labelBox.y + (labelBox.height * 1.5)) >= y
			&& (labelBox.y - (labelBox.height * 0.5)) <= y
	};
	const overlapsX = (svgElement, x) => {
		const labelBox = svgElement.getBBox();
		return (labelBox.x - (labelBox.width * 0.5)) <= x
			&& (labelBox.x + (labelBox.width * 1.5)) >= x
	};


	function plotWidth({ width, leftMargin, rightMargin }) {
		return width - leftMargin - rightMargin;
	}

	function plotHeight({ height, bottomMargin, topMargin }) {
		return height - bottomMargin - topMargin;
	}

	function calculatePlotX({ leftMargin, plotWidth, minsAndMaxes, dataRanges }) {
		return x => {
		const xRatio = ((x - minsAndMaxes.minX) / dataRanges.x);

		return leftMargin + (xRatio * plotWidth)
	};
	}

	function calculatePlotY({ plotHeight, minsAndMaxes, dataRanges, topMargin }) {
		return y => {
		const yRatio = ((y - minsAndMaxes.minY) / dataRanges.y);

		return topMargin + plotHeight - (yRatio * plotHeight)
	};
	}

	function minsAndMaxes({ datasets }) {
		return flatten(
		datasets.map(({ points }) => points)
	).reduce(
		({ minX, maxX, minY, maxY }, { x, y }) => ({
			minX: min(minX, x),
			maxX: max(maxX, x),
			minY: min(minY, y),
			maxY: max(maxY, y),
		}), { minX: null, maxX: null, minY: null, maxY: null }
	);
	}

	function dataRanges({ minsAndMaxes }) {
		return {
		x: minsAndMaxes.maxX - minsAndMaxes.minX,
		y: minsAndMaxes.maxY - minsAndMaxes.minY,
	};
	}

	function yLabelX({ leftMargin, plotXMargin, tickLength, labelBuffer }) {
		return leftMargin - plotXMargin - tickLength - (labelBuffer * 2);
	}

	function xLabelY({ topMargin, plotHeight, plotYMargin, tickLength, labelBuffer }) {
		return topMargin + plotHeight + plotYMargin + tickLength + labelBuffer;
	}

	function dataOpacity({ hoveredPoint }) {
		return hoveredPoint ? 0.4 : 0.8;
	}

	function data() {
		return {
			leftMargin: 100,
			rightMargin: 50,
			topMargin: 40,
			bottomMargin: 80,

			width: 600,
			height: 300,

			bottomFrame: `ticks`,
			leftFrame: `ticks`,
			pointSize: 2,
			tickLength: 10,
			tickWidth: 0.8,
			labelBuffer: 4,

			datasets: [{
				points: [],
				color: `black`,
			}],
			formatX: identity,
			formatY: identity,
			plotYMargin: 20,
			plotXMargin: 20,

			fontSize: 16,
			baseColor: `#797979`,
			highlightColor: `#9A0000`,

			hoveredPoint: null,
			hoveredColor: null,
			hoverOverlaps: {},
		}
	}
	var methods = {
		calculateBestHover(event) {
			const { clientX, clientY } = event;

			let cursorIsDirectlyOverPoints = false;
			const relevantPoints = document.elementsFromPoint(clientX, clientY).filter(element => {
				cursorIsDirectlyOverPoints = cursorIsDirectlyOverPoints || !!element.dataset.actualPoint;
				return `pointIndex` in element.dataset && `datasetIndex` in element.dataset
			}).filter(
				element => cursorIsDirectlyOverPoints ? element.dataset.actualPoint : !element.dataset.actualPoint
			);

			const currentlyHoveredPoint = this.get().hoveredPoint;
			const setHoverPoint = element => {
				const datasetIndex = parseInt(element.dataset.datasetIndex, 10);
				const pointIndex = parseInt(element.dataset.pointIndex, 10);
				const dataset = this.get().datasets[datasetIndex];
				const point = dataset.points[pointIndex];
				if (point !== currentlyHoveredPoint) {
					this.hover(point, dataset);
				}
			};

			if (relevantPoints.length === 1) {
				setHoverPoint(relevantPoints[0]);
			} else if (relevantPoints.length > 1) {
				const pointsToSort = relevantPoints.map(element => {
					const { x, y } = element.getBoundingClientRect();
					const xDiff = Math.abs(x - clientX);
					const yDiff = Math.abs(y - clientY);
					return {
						diff: xDiff + yDiff,
						element,
					}
				});

				pointsToSort.sort((a, b) => a.diff - b.diff);
				setHoverPoint(pointsToSort[0].element);
			}
		},
		hover(hoveredPoint, dataset = null) {
			const { calculatePlotX, calculatePlotY } = this.get();

			const hoverOverlaps = {};

			if (hoveredPoint) {
				const pointYPosition = calculatePlotY(hoveredPoint.y);

				if (this.refs.maxYLabel) {
					hoverOverlaps.maxYLabel = overlapsY(this.refs.maxYLabel, pointYPosition);
				}

				if (this.refs.minYLabel) {
					hoverOverlaps.minYLabel = overlapsY(this.refs.minYLabel, pointYPosition);
				}

				const pointXPosition = calculatePlotX(hoveredPoint.x);

				if (this.refs.maxXLabel) {
					hoverOverlaps.maxXLabel = overlapsX(this.refs.maxXLabel, pointXPosition);
				}

				if (this.refs.minXLabel) {
					hoverOverlaps.minXLabel = overlapsX(this.refs.minXLabel, pointXPosition);
				}
			}

			this.set({
				hoveredPoint,
				hoverOverlaps,
				hoveredColor: dataset && dataset.color,
			});
		},
	};

	function add_css() {
		var style = createElement("style");
		style.id = 'svelte-o02ty2-style';
		style.textContent = "line.svelte-o02ty2{transition:stroke-opacity 400ms}circle[data-hovered=false].svelte-o02ty2{transition:fill-opacity 400ms}";
		append(document.head, style);
	}

	function create_main_fragment(component, ctx) {
		var svg, if_block_anchor, if_block_1_anchor, if_block_2_anchor, if_block_3_anchor, g, g_1, if_block_6_anchor, svg_viewBox_value;

		var if_block = (!ctx.hoverOverlaps.maxYLabel) && create_if_block(component, ctx);

		var if_block_1 = (!ctx.hoverOverlaps.minYLabel) && create_if_block_1(component, ctx);

		var if_block_2 = (!ctx.hoverOverlaps.maxXLabel) && create_if_block_2(component, ctx);

		var if_block_3 = (!ctx.hoverOverlaps.minXLabel) && create_if_block_3(component, ctx);

		function select_block_type(ctx) {
			if (ctx.leftFrame === 'ticks') return create_if_block_4;
			if (ctx.leftFrame === 'line') return create_if_block_5;
			return null;
		}

		var current_block_type = select_block_type(ctx);
		var if_block_4 = current_block_type && current_block_type(component, ctx);

		var each_value_2 = ctx.datasets;

		var each_blocks = [];

		for (var i = 0; i < each_value_2.length; i += 1) {
			each_blocks[i] = create_each_block_2(component, get_each_context_2(ctx, each_value_2, i));
		}

		var each_value_4 = ctx.datasets;

		var each_1_blocks = [];

		for (var i = 0; i < each_value_4.length; i += 1) {
			each_1_blocks[i] = create_each_block_4(component, get_each_1_context(ctx, each_value_4, i));
		}

		function select_block_type_1(ctx) {
			if (ctx.bottomFrame === 'ticks') return create_if_block_6;
			if (ctx.bottomFrame === 'line') return create_if_block_7;
			return null;
		}

		var current_block_type_1 = select_block_type_1(ctx);
		var if_block_6 = current_block_type_1 && current_block_type_1(component, ctx);

		var if_block_8 = (ctx.hoveredPoint) && create_if_block_8(component, ctx);

		return {
			c() {
				svg = createSvgElement("svg");
				if (if_block) if_block.c();
				if_block_anchor = createComment();
				if (if_block_1) if_block_1.c();
				if_block_1_anchor = createComment();
				if (if_block_2) if_block_2.c();
				if_block_2_anchor = createComment();
				if (if_block_3) if_block_3.c();
				if_block_3_anchor = createComment();
				if (if_block_4) if_block_4.c();
				g = createSvgElement("g");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				g_1 = createSvgElement("g");

				for (var i = 0; i < each_1_blocks.length; i += 1) {
					each_1_blocks[i].c();
				}

				if (if_block_6) if_block_6.c();
				if_block_6_anchor = createComment();
				if (if_block_8) if_block_8.c();
				setAttribute(g, "fill-opacity", "0");
				setAttribute(g_1, "fill-opacity", ctx.dataOpacity);
				setAttribute(svg, "xmlns", "http://www.w3.org/2000/svg");
				setAttribute(svg, "viewBox", svg_viewBox_value = "0 0 " + ctx.width + " " + ctx.height);
			},

			m(target, anchor) {
				insert(target, svg, anchor);
				if (if_block) if_block.i(svg, null);
				append(svg, if_block_anchor);
				if (if_block_1) if_block_1.i(svg, null);
				append(svg, if_block_1_anchor);
				if (if_block_2) if_block_2.i(svg, null);
				append(svg, if_block_2_anchor);
				if (if_block_3) if_block_3.i(svg, null);
				append(svg, if_block_3_anchor);
				if (if_block_4) if_block_4.m(svg, null);
				append(svg, g);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(g, null);
				}

				append(svg, g_1);

				for (var i = 0; i < each_1_blocks.length; i += 1) {
					each_1_blocks[i].m(g_1, null);
				}

				if (if_block_6) if_block_6.m(svg, null);
				append(svg, if_block_6_anchor);
				if (if_block_8) if_block_8.i(svg, null);
			},

			p(changed, ctx) {
				if (!ctx.hoverOverlaps.maxYLabel) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block(component, ctx);
						if (if_block) if_block.c();
					}

					if_block.i(svg, if_block_anchor);
				} else if (if_block) {
					groupOutros();
					if_block.o(function() {
						if_block.d(1);
						if_block = null;
					});
				}

				if (!ctx.hoverOverlaps.minYLabel) {
					if (if_block_1) {
						if_block_1.p(changed, ctx);
					} else {
						if_block_1 = create_if_block_1(component, ctx);
						if (if_block_1) if_block_1.c();
					}

					if_block_1.i(svg, if_block_1_anchor);
				} else if (if_block_1) {
					groupOutros();
					if_block_1.o(function() {
						if_block_1.d(1);
						if_block_1 = null;
					});
				}

				if (!ctx.hoverOverlaps.maxXLabel) {
					if (if_block_2) {
						if_block_2.p(changed, ctx);
					} else {
						if_block_2 = create_if_block_2(component, ctx);
						if (if_block_2) if_block_2.c();
					}

					if_block_2.i(svg, if_block_2_anchor);
				} else if (if_block_2) {
					groupOutros();
					if_block_2.o(function() {
						if_block_2.d(1);
						if_block_2 = null;
					});
				}

				if (!ctx.hoverOverlaps.minXLabel) {
					if (if_block_3) {
						if_block_3.p(changed, ctx);
					} else {
						if_block_3 = create_if_block_3(component, ctx);
						if (if_block_3) if_block_3.c();
					}

					if_block_3.i(svg, if_block_3_anchor);
				} else if (if_block_3) {
					groupOutros();
					if_block_3.o(function() {
						if_block_3.d(1);
						if_block_3 = null;
					});
				}

				if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block_4) {
					if_block_4.p(changed, ctx);
				} else {
					if (if_block_4) if_block_4.d(1);
					if_block_4 = current_block_type && current_block_type(component, ctx);
					if (if_block_4) if_block_4.c();
					if (if_block_4) if_block_4.m(svg, g);
				}

				if (changed.datasets || changed.pointSize || changed.calculatePlotX || changed.calculatePlotY) {
					each_value_2 = ctx.datasets;

					for (var i = 0; i < each_value_2.length; i += 1) {
						const child_ctx = get_each_context_2(ctx, each_value_2, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_2(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(g, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value_2.length;
				}

				if (changed.datasets || changed.calculatePlotX || changed.calculatePlotY || changed.hoveredPoint || changed.pointSize) {
					each_value_4 = ctx.datasets;

					for (var i = 0; i < each_value_4.length; i += 1) {
						const child_ctx = get_each_1_context(ctx, each_value_4, i);

						if (each_1_blocks[i]) {
							each_1_blocks[i].p(changed, child_ctx);
						} else {
							each_1_blocks[i] = create_each_block_4(component, child_ctx);
							each_1_blocks[i].c();
							each_1_blocks[i].m(g_1, null);
						}
					}

					for (; i < each_1_blocks.length; i += 1) {
						each_1_blocks[i].d(1);
					}
					each_1_blocks.length = each_value_4.length;
				}

				if (changed.dataOpacity) {
					setAttribute(g_1, "fill-opacity", ctx.dataOpacity);
				}

				if (current_block_type_1 === (current_block_type_1 = select_block_type_1(ctx)) && if_block_6) {
					if_block_6.p(changed, ctx);
				} else {
					if (if_block_6) if_block_6.d(1);
					if_block_6 = current_block_type_1 && current_block_type_1(component, ctx);
					if (if_block_6) if_block_6.c();
					if (if_block_6) if_block_6.m(svg, if_block_6_anchor);
				}

				if (ctx.hoveredPoint) {
					if (if_block_8) {
						if_block_8.p(changed, ctx);
					} else {
						if_block_8 = create_if_block_8(component, ctx);
						if (if_block_8) if_block_8.c();
					}

					if_block_8.i(svg, null);
				} else if (if_block_8) {
					groupOutros();
					if_block_8.o(function() {
						if_block_8.d(1);
						if_block_8 = null;
					});
				}

				if ((changed.width || changed.height) && svg_viewBox_value !== (svg_viewBox_value = "0 0 " + ctx.width + " " + ctx.height)) {
					setAttribute(svg, "viewBox", svg_viewBox_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(svg);
				}

				if (if_block) if_block.d();
				if (if_block_1) if_block_1.d();
				if (if_block_2) if_block_2.d();
				if (if_block_3) if_block_3.d();
				if (if_block_4) if_block_4.d();

				destroyEach(each_blocks, detach);

				destroyEach(each_1_blocks, detach);

				if (if_block_6) if_block_6.d();
				if (if_block_8) if_block_8.d();
			}
		};
	}

	// (2:1) {#if !hoverOverlaps.maxYLabel}
	function create_if_block(component, ctx) {
		var text, text_1_value = ctx.formatY(ctx.minsAndMaxes.maxY), text_1, text_y_value, text_transition, current;

		return {
			c() {
				text = createSvgElement("text");
				text_1 = createText(text_1_value);
				setAttribute(text, "fill", ctx.baseColor);
				setStyle(text, "font-size", "" + ctx.fontSize + "px");
				setAttribute(text, "text-anchor", "end");
				setAttribute(text, "x", ctx.yLabelX);
				setAttribute(text, "y", text_y_value = ctx.calculatePlotY(ctx.minsAndMaxes.maxY));
				setAttribute(text, "dy", "4");
			},

			m(target, anchor) {
				insert(target, text, anchor);
				append(text, text_1);
				component.refs.maxYLabel = text;
				current = true;
			},

			p(changed, ctx) {
				if ((!current || changed.formatY || changed.minsAndMaxes) && text_1_value !== (text_1_value = ctx.formatY(ctx.minsAndMaxes.maxY))) {
					setData(text_1, text_1_value);
				}

				if (!current || changed.baseColor) {
					setAttribute(text, "fill", ctx.baseColor);
				}

				if (!current || changed.fontSize) {
					setStyle(text, "font-size", "" + ctx.fontSize + "px");
				}

				if (!current || changed.yLabelX) {
					setAttribute(text, "x", ctx.yLabelX);
				}

				if ((!current || changed.calculatePlotY || changed.minsAndMaxes) && text_y_value !== (text_y_value = ctx.calculatePlotY(ctx.minsAndMaxes.maxY))) {
					setAttribute(text, "y", text_y_value);
				}
			},

			i(target, anchor) {
				if (current) return;
				if (component.root._intro) {
					if (text_transition) text_transition.invalidate();

					component.root._aftercreate.push(() => {
						if (!text_transition) text_transition = wrapTransition(component, text, fade, {duration: 200}, true);
						text_transition.run(1);
					});
				}
				this.m(target, anchor);
			},

			o(outrocallback) {
				if (!current) return;

				if (!text_transition) text_transition = wrapTransition(component, text, fade, {duration: 200}, false);
				text_transition.run(0, () => {
					outrocallback();
					text_transition = null;
				});

				current = false;
			},

			d(detach) {
				if (detach) {
					detachNode(text);
				}

				if (component.refs.maxYLabel === text) component.refs.maxYLabel = null;
				if (detach) {
					if (text_transition) text_transition.abort();
				}
			}
		};
	}

	// (16:1) {#if !hoverOverlaps.minYLabel}
	function create_if_block_1(component, ctx) {
		var text, text_1_value = ctx.formatY(ctx.minsAndMaxes.minY), text_1, text_y_value, text_transition, current;

		return {
			c() {
				text = createSvgElement("text");
				text_1 = createText(text_1_value);
				setAttribute(text, "fill", ctx.baseColor);
				setStyle(text, "font-size", "" + ctx.fontSize + "px");
				setAttribute(text, "text-anchor", "end");
				setAttribute(text, "x", ctx.yLabelX);
				setAttribute(text, "y", text_y_value = ctx.calculatePlotY(ctx.minsAndMaxes.minY));
				setAttribute(text, "dy", "4");
			},

			m(target, anchor) {
				insert(target, text, anchor);
				append(text, text_1);
				component.refs.minYLabel = text;
				current = true;
			},

			p(changed, ctx) {
				if ((!current || changed.formatY || changed.minsAndMaxes) && text_1_value !== (text_1_value = ctx.formatY(ctx.minsAndMaxes.minY))) {
					setData(text_1, text_1_value);
				}

				if (!current || changed.baseColor) {
					setAttribute(text, "fill", ctx.baseColor);
				}

				if (!current || changed.fontSize) {
					setStyle(text, "font-size", "" + ctx.fontSize + "px");
				}

				if (!current || changed.yLabelX) {
					setAttribute(text, "x", ctx.yLabelX);
				}

				if ((!current || changed.calculatePlotY || changed.minsAndMaxes) && text_y_value !== (text_y_value = ctx.calculatePlotY(ctx.minsAndMaxes.minY))) {
					setAttribute(text, "y", text_y_value);
				}
			},

			i(target, anchor) {
				if (current) return;
				if (component.root._intro) {
					if (text_transition) text_transition.invalidate();

					component.root._aftercreate.push(() => {
						if (!text_transition) text_transition = wrapTransition(component, text, fade, {duration: 200}, true);
						text_transition.run(1);
					});
				}
				this.m(target, anchor);
			},

			o(outrocallback) {
				if (!current) return;

				if (!text_transition) text_transition = wrapTransition(component, text, fade, {duration: 200}, false);
				text_transition.run(0, () => {
					outrocallback();
					text_transition = null;
				});

				current = false;
			},

			d(detach) {
				if (detach) {
					detachNode(text);
				}

				if (component.refs.minYLabel === text) component.refs.minYLabel = null;
				if (detach) {
					if (text_transition) text_transition.abort();
				}
			}
		};
	}

	// (34:1) {#if !hoverOverlaps.maxXLabel}
	function create_if_block_2(component, ctx) {
		var text, text_1_value = ctx.formatX(ctx.minsAndMaxes.maxX), text_1, text_x_value, text_transition, current;

		return {
			c() {
				text = createSvgElement("text");
				text_1 = createText(text_1_value);
				setAttribute(text, "fill", ctx.baseColor);
				setStyle(text, "font-size", "" + ctx.fontSize + "px");
				setAttribute(text, "text-anchor", "middle");
				setAttribute(text, "x", text_x_value = ctx.calculatePlotX(ctx.minsAndMaxes.maxX));
				setAttribute(text, "y", ctx.xLabelY);
				setAttribute(text, "dy", ctx.fontSize);
			},

			m(target, anchor) {
				insert(target, text, anchor);
				append(text, text_1);
				component.refs.maxXLabel = text;
				current = true;
			},

			p(changed, ctx) {
				if ((!current || changed.formatX || changed.minsAndMaxes) && text_1_value !== (text_1_value = ctx.formatX(ctx.minsAndMaxes.maxX))) {
					setData(text_1, text_1_value);
				}

				if (!current || changed.baseColor) {
					setAttribute(text, "fill", ctx.baseColor);
				}

				if (!current || changed.fontSize) {
					setStyle(text, "font-size", "" + ctx.fontSize + "px");
				}

				if ((!current || changed.calculatePlotX || changed.minsAndMaxes) && text_x_value !== (text_x_value = ctx.calculatePlotX(ctx.minsAndMaxes.maxX))) {
					setAttribute(text, "x", text_x_value);
				}

				if (!current || changed.xLabelY) {
					setAttribute(text, "y", ctx.xLabelY);
				}

				if (!current || changed.fontSize) {
					setAttribute(text, "dy", ctx.fontSize);
				}
			},

			i(target, anchor) {
				if (current) return;
				if (component.root._intro) {
					if (text_transition) text_transition.invalidate();

					component.root._aftercreate.push(() => {
						if (!text_transition) text_transition = wrapTransition(component, text, fade, {duration: 200}, true);
						text_transition.run(1);
					});
				}
				this.m(target, anchor);
			},

			o(outrocallback) {
				if (!current) return;

				if (!text_transition) text_transition = wrapTransition(component, text, fade, {duration: 200}, false);
				text_transition.run(0, () => {
					outrocallback();
					text_transition = null;
				});

				current = false;
			},

			d(detach) {
				if (detach) {
					detachNode(text);
				}

				if (component.refs.maxXLabel === text) component.refs.maxXLabel = null;
				if (detach) {
					if (text_transition) text_transition.abort();
				}
			}
		};
	}

	// (48:1) {#if !hoverOverlaps.minXLabel}
	function create_if_block_3(component, ctx) {
		var text, text_1_value = ctx.formatX(ctx.minsAndMaxes.minX), text_1, text_x_value, text_transition, current;

		return {
			c() {
				text = createSvgElement("text");
				text_1 = createText(text_1_value);
				setAttribute(text, "fill", ctx.baseColor);
				setStyle(text, "font-size", "" + ctx.fontSize + "px");
				setAttribute(text, "text-anchor", "middle");
				setAttribute(text, "x", text_x_value = ctx.calculatePlotX(ctx.minsAndMaxes.minX));
				setAttribute(text, "y", ctx.xLabelY);
				setAttribute(text, "dy", ctx.fontSize);
			},

			m(target, anchor) {
				insert(target, text, anchor);
				append(text, text_1);
				component.refs.minXLabel = text;
				current = true;
			},

			p(changed, ctx) {
				if ((!current || changed.formatX || changed.minsAndMaxes) && text_1_value !== (text_1_value = ctx.formatX(ctx.minsAndMaxes.minX))) {
					setData(text_1, text_1_value);
				}

				if (!current || changed.baseColor) {
					setAttribute(text, "fill", ctx.baseColor);
				}

				if (!current || changed.fontSize) {
					setStyle(text, "font-size", "" + ctx.fontSize + "px");
				}

				if ((!current || changed.calculatePlotX || changed.minsAndMaxes) && text_x_value !== (text_x_value = ctx.calculatePlotX(ctx.minsAndMaxes.minX))) {
					setAttribute(text, "x", text_x_value);
				}

				if (!current || changed.xLabelY) {
					setAttribute(text, "y", ctx.xLabelY);
				}

				if (!current || changed.fontSize) {
					setAttribute(text, "dy", ctx.fontSize);
				}
			},

			i(target, anchor) {
				if (current) return;
				if (component.root._intro) {
					if (text_transition) text_transition.invalidate();

					component.root._aftercreate.push(() => {
						if (!text_transition) text_transition = wrapTransition(component, text, fade, {duration: 200}, true);
						text_transition.run(1);
					});
				}
				this.m(target, anchor);
			},

			o(outrocallback) {
				if (!current) return;

				if (!text_transition) text_transition = wrapTransition(component, text, fade, {duration: 200}, false);
				text_transition.run(0, () => {
					outrocallback();
					text_transition = null;
				});

				current = false;
			},

			d(detach) {
				if (detach) {
					detachNode(text);
				}

				if (component.refs.minXLabel === text) component.refs.minXLabel = null;
				if (detach) {
					if (text_transition) text_transition.abort();
				}
			}
		};
	}

	// (69:3) {#each datasets as dataset}
	function create_each_block(component, ctx) {
		var g, g_stroke_value;

		var each_value_1 = ctx.dataset.points;

		var each_blocks = [];

		for (var i = 0; i < each_value_1.length; i += 1) {
			each_blocks[i] = create_each_block_1(component, get_each_context_1(ctx, each_value_1, i));
		}

		return {
			c() {
				g = createSvgElement("g");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				setAttribute(g, "stroke", g_stroke_value = ctx.dataset.color);
			},

			m(target, anchor) {
				insert(target, g, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(g, null);
				}
			},

			p(changed, ctx) {
				if (changed.leftMargin || changed.plotXMargin || changed.tickLength || changed.calculatePlotY || changed.datasets) {
					each_value_1 = ctx.dataset.points;

					for (var i = 0; i < each_value_1.length; i += 1) {
						const child_ctx = get_each_context_1(ctx, each_value_1, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_1(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(g, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value_1.length;
				}

				if ((changed.datasets) && g_stroke_value !== (g_stroke_value = ctx.dataset.color)) {
					setAttribute(g, "stroke", g_stroke_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(g);
				}

				destroyEach(each_blocks, detach);
			}
		};
	}

	// (71:5) {#each dataset.points as point}
	function create_each_block_1(component, ctx) {
		var line, line_x__value, line_x__value_1, line_y__value, line_y__value_1;

		return {
			c() {
				line = createSvgElement("line");
				setAttribute(line, "x1", line_x__value = "" + (ctx.leftMargin - ctx.plotXMargin - ctx.tickLength) + "px");
				setAttribute(line, "x2", line_x__value_1 = "" + (ctx.leftMargin - ctx.plotXMargin) + "px");
				setAttribute(line, "y1", line_y__value = "" + ctx.calculatePlotY(ctx.point.y) + "px");
				setAttribute(line, "y2", line_y__value_1 = "" + ctx.calculatePlotY(ctx.point.y) + "px");
				setAttribute(line, "class", "svelte-o02ty2");
			},

			m(target, anchor) {
				insert(target, line, anchor);
			},

			p(changed, ctx) {
				if ((changed.leftMargin || changed.plotXMargin || changed.tickLength) && line_x__value !== (line_x__value = "" + (ctx.leftMargin - ctx.plotXMargin - ctx.tickLength) + "px")) {
					setAttribute(line, "x1", line_x__value);
				}

				if ((changed.leftMargin || changed.plotXMargin) && line_x__value_1 !== (line_x__value_1 = "" + (ctx.leftMargin - ctx.plotXMargin) + "px")) {
					setAttribute(line, "x2", line_x__value_1);
				}

				if ((changed.calculatePlotY || changed.datasets) && line_y__value !== (line_y__value = "" + ctx.calculatePlotY(ctx.point.y) + "px")) {
					setAttribute(line, "y1", line_y__value);
				}

				if ((changed.calculatePlotY || changed.datasets) && line_y__value_1 !== (line_y__value_1 = "" + ctx.calculatePlotY(ctx.point.y) + "px")) {
					setAttribute(line, "y2", line_y__value_1);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(line);
				}
			}
		};
	}

	// (64:1) {#if leftFrame === 'ticks'}
	function create_if_block_4(component, ctx) {
		var g, g_stroke_width_value, g_stroke_opacity_value;

		var each_value = ctx.datasets;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block(component, get_each_context(ctx, each_value, i));
		}

		return {
			c() {
				g = createSvgElement("g");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				setAttribute(g, "stroke-width", g_stroke_width_value = "" + ctx.tickWidth + "px");
				setAttribute(g, "stroke-opacity", g_stroke_opacity_value = ctx.dataOpacity * 0.5);
			},

			m(target, anchor) {
				insert(target, g, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(g, null);
				}
			},

			p(changed, ctx) {
				if (changed.datasets || changed.leftMargin || changed.plotXMargin || changed.tickLength || changed.calculatePlotY) {
					each_value = ctx.datasets;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(g, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if ((changed.tickWidth) && g_stroke_width_value !== (g_stroke_width_value = "" + ctx.tickWidth + "px")) {
					setAttribute(g, "stroke-width", g_stroke_width_value);
				}

				if ((changed.dataOpacity) && g_stroke_opacity_value !== (g_stroke_opacity_value = ctx.dataOpacity * 0.5)) {
					setAttribute(g, "stroke-opacity", g_stroke_opacity_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(g);
				}

				destroyEach(each_blocks, detach);
			}
		};
	}

	// (82:31) 
	function create_if_block_5(component, ctx) {
		var line, line_x__value, line_x__value_1, line_y__value, line_y__value_1;

		return {
			c() {
				line = createSvgElement("line");
				setAttribute(line, "x1", line_x__value = "" + (ctx.leftMargin - ctx.plotXMargin) + "px");
				setAttribute(line, "x2", line_x__value_1 = "" + (ctx.leftMargin - ctx.plotXMargin) + "px");
				setAttribute(line, "y1", line_y__value = "" + ctx.calculatePlotY(ctx.minsAndMaxes.minY) + "px");
				setAttribute(line, "y2", line_y__value_1 = "" + ctx.calculatePlotY(ctx.minsAndMaxes.maxY) + "px");
				setAttribute(line, "stroke", ctx.baseColor);
				setAttribute(line, "stroke-width", "1px");
				setAttribute(line, "class", "svelte-o02ty2");
			},

			m(target, anchor) {
				insert(target, line, anchor);
			},

			p(changed, ctx) {
				if ((changed.leftMargin || changed.plotXMargin) && line_x__value !== (line_x__value = "" + (ctx.leftMargin - ctx.plotXMargin) + "px")) {
					setAttribute(line, "x1", line_x__value);
				}

				if ((changed.leftMargin || changed.plotXMargin) && line_x__value_1 !== (line_x__value_1 = "" + (ctx.leftMargin - ctx.plotXMargin) + "px")) {
					setAttribute(line, "x2", line_x__value_1);
				}

				if ((changed.calculatePlotY || changed.minsAndMaxes) && line_y__value !== (line_y__value = "" + ctx.calculatePlotY(ctx.minsAndMaxes.minY) + "px")) {
					setAttribute(line, "y1", line_y__value);
				}

				if ((changed.calculatePlotY || changed.minsAndMaxes) && line_y__value_1 !== (line_y__value_1 = "" + ctx.calculatePlotY(ctx.minsAndMaxes.maxY) + "px")) {
					setAttribute(line, "y2", line_y__value_1);
				}

				if (changed.baseColor) {
					setAttribute(line, "stroke", ctx.baseColor);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(line);
				}
			}
		};
	}

	// (95:2) {#each datasets as dataset, datasetIndex}
	function create_each_block_2(component, ctx) {
		var each_anchor;

		var each_value_3 = ctx.dataset.points;

		var each_blocks = [];

		for (var i = 0; i < each_value_3.length; i += 1) {
			each_blocks[i] = create_each_block_3(component, get_each_context_3(ctx, each_value_3, i));
		}

		return {
			c() {
				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				each_anchor = createComment();
			},

			m(target, anchor) {
				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(target, anchor);
				}

				insert(target, each_anchor, anchor);
			},

			p(changed, ctx) {
				if (changed.pointSize || changed.calculatePlotX || changed.datasets || changed.calculatePlotY) {
					each_value_3 = ctx.dataset.points;

					for (var i = 0; i < each_value_3.length; i += 1) {
						const child_ctx = get_each_context_3(ctx, each_value_3, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_3(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(each_anchor.parentNode, each_anchor);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value_3.length;
				}
			},

			d(detach) {
				destroyEach(each_blocks, detach);

				if (detach) {
					detachNode(each_anchor);
				}
			}
		};
	}

	// (96:3) {#each dataset.points as point, pointIndex}
	function create_each_block_3(component, ctx) {
		var circle, circle_r_value, circle_cx_value, circle_cy_value;

		return {
			c() {
				circle = createSvgElement("circle");
				circle._svelte = { component, ctx };

				addListener(circle, "mousemove", mousemove_handler);
				addListener(circle, "click", click_handler);
				setAttribute(circle, "r", circle_r_value = ctx.pointSize * 3);
				setAttribute(circle, "cx", circle_cx_value = "" + ctx.calculatePlotX(ctx.point.x) + "px");
				setAttribute(circle, "cy", circle_cy_value = "" + ctx.calculatePlotY(ctx.point.y) + "px");
				setAttribute(circle, "data-dataset-index", ctx.datasetIndex);
				setAttribute(circle, "data-point-index", ctx.pointIndex);
			},

			m(target, anchor) {
				insert(target, circle, anchor);
			},

			p(changed, _ctx) {
				ctx = _ctx;
				circle._svelte.ctx = ctx;
				if ((changed.pointSize) && circle_r_value !== (circle_r_value = ctx.pointSize * 3)) {
					setAttribute(circle, "r", circle_r_value);
				}

				if ((changed.calculatePlotX || changed.datasets) && circle_cx_value !== (circle_cx_value = "" + ctx.calculatePlotX(ctx.point.x) + "px")) {
					setAttribute(circle, "cx", circle_cx_value);
				}

				if ((changed.calculatePlotY || changed.datasets) && circle_cy_value !== (circle_cy_value = "" + ctx.calculatePlotY(ctx.point.y) + "px")) {
					setAttribute(circle, "cy", circle_cy_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(circle);
				}

				removeListener(circle, "mousemove", mousemove_handler);
				removeListener(circle, "click", click_handler);
			}
		};
	}

	// (111:2) {#each datasets as dataset, datasetIndex}
	function create_each_block_4(component, ctx) {
		var g, g_fill_value;

		var each_value_5 = ctx.dataset.points;

		var each_blocks = [];

		for (var i = 0; i < each_value_5.length; i += 1) {
			each_blocks[i] = create_each_block_5(component, get_each_context_4(ctx, each_value_5, i));
		}

		return {
			c() {
				g = createSvgElement("g");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				setAttribute(g, "fill", g_fill_value = ctx.dataset.color);
			},

			m(target, anchor) {
				insert(target, g, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(g, null);
				}
			},

			p(changed, ctx) {
				if (changed.calculatePlotX || changed.datasets || changed.calculatePlotY || changed.hoveredPoint || changed.pointSize) {
					each_value_5 = ctx.dataset.points;

					for (var i = 0; i < each_value_5.length; i += 1) {
						const child_ctx = get_each_context_4(ctx, each_value_5, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_5(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(g, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value_5.length;
				}

				if ((changed.datasets) && g_fill_value !== (g_fill_value = ctx.dataset.color)) {
					setAttribute(g, "fill", g_fill_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(g);
				}

				destroyEach(each_blocks, detach);
			}
		};
	}

	// (113:4) {#each dataset.points as point, pointIndex}
	function create_each_block_5(component, ctx) {
		var circle, circle_cx_value, circle_cy_value, circle_r_value, circle_fill_opacity_value, circle_data_hovered_value;

		return {
			c() {
				circle = createSvgElement("circle");
				circle._svelte = { component, ctx };

				addListener(circle, "mousemove", mousemove_handler_1);
				addListener(circle, "click", click_handler_1);
				addListener(circle, "mouseleave", mouseleave_handler);
				setAttribute(circle, "cx", circle_cx_value = "" + ctx.calculatePlotX(ctx.point.x) + "px");
				setAttribute(circle, "cy", circle_cy_value = "" + ctx.calculatePlotY(ctx.point.y) + "px");
				setAttribute(circle, "r", circle_r_value = ctx.point === ctx.hoveredPoint ? ctx.pointSize * 3 : ctx.pointSize);
				setAttribute(circle, "fill-opacity", circle_fill_opacity_value = ctx.point === ctx.hoveredPoint ? 1 : 'inherit');
				setAttribute(circle, "data-dataset-index", ctx.datasetIndex);
				setAttribute(circle, "data-point-index", ctx.pointIndex);
				setAttribute(circle, "data-actual-point", true);
				setAttribute(circle, "data-hovered", circle_data_hovered_value = ctx.point === ctx.hoveredPoint);
				setAttribute(circle, "class", "svelte-o02ty2");
			},

			m(target, anchor) {
				insert(target, circle, anchor);
			},

			p(changed, _ctx) {
				ctx = _ctx;
				circle._svelte.ctx = ctx;
				if ((changed.calculatePlotX || changed.datasets) && circle_cx_value !== (circle_cx_value = "" + ctx.calculatePlotX(ctx.point.x) + "px")) {
					setAttribute(circle, "cx", circle_cx_value);
				}

				if ((changed.calculatePlotY || changed.datasets) && circle_cy_value !== (circle_cy_value = "" + ctx.calculatePlotY(ctx.point.y) + "px")) {
					setAttribute(circle, "cy", circle_cy_value);
				}

				if ((changed.datasets || changed.hoveredPoint || changed.pointSize) && circle_r_value !== (circle_r_value = ctx.point === ctx.hoveredPoint ? ctx.pointSize * 3 : ctx.pointSize)) {
					setAttribute(circle, "r", circle_r_value);
				}

				if ((changed.datasets || changed.hoveredPoint) && circle_fill_opacity_value !== (circle_fill_opacity_value = ctx.point === ctx.hoveredPoint ? 1 : 'inherit')) {
					setAttribute(circle, "fill-opacity", circle_fill_opacity_value);
				}

				if ((changed.datasets || changed.hoveredPoint) && circle_data_hovered_value !== (circle_data_hovered_value = ctx.point === ctx.hoveredPoint)) {
					setAttribute(circle, "data-hovered", circle_data_hovered_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(circle);
				}

				removeListener(circle, "mousemove", mousemove_handler_1);
				removeListener(circle, "click", click_handler_1);
				removeListener(circle, "mouseleave", mouseleave_handler);
			}
		};
	}

	// (137:3) {#each datasets as dataset}
	function create_each_block_6(component, ctx) {
		var g, g_stroke_value;

		var each_value_7 = ctx.dataset.points;

		var each_blocks = [];

		for (var i = 0; i < each_value_7.length; i += 1) {
			each_blocks[i] = create_each_block_7(component, get_each_context_6(ctx, each_value_7, i));
		}

		return {
			c() {
				g = createSvgElement("g");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				setAttribute(g, "stroke", g_stroke_value = ctx.dataset.color);
			},

			m(target, anchor) {
				insert(target, g, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(g, null);
				}
			},

			p(changed, ctx) {
				if (changed.calculatePlotX || changed.datasets || changed.topMargin || changed.plotYMargin || changed.plotHeight || changed.tickLength) {
					each_value_7 = ctx.dataset.points;

					for (var i = 0; i < each_value_7.length; i += 1) {
						const child_ctx = get_each_context_6(ctx, each_value_7, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_7(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(g, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value_7.length;
				}

				if ((changed.datasets) && g_stroke_value !== (g_stroke_value = ctx.dataset.color)) {
					setAttribute(g, "stroke", g_stroke_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(g);
				}

				destroyEach(each_blocks, detach);
			}
		};
	}

	// (139:5) {#each dataset.points as point}
	function create_each_block_7(component, ctx) {
		var line, line_x__value, line_x__value_1, line_y__value, line_y__value_1;

		return {
			c() {
				line = createSvgElement("line");
				setAttribute(line, "x1", line_x__value = "" + ctx.calculatePlotX(ctx.point.x) + "px");
				setAttribute(line, "x2", line_x__value_1 = "" + ctx.calculatePlotX(ctx.point.x) + "px");
				setAttribute(line, "y1", line_y__value = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight) + "px");
				setAttribute(line, "y2", line_y__value_1 = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight + ctx.tickLength) + "px");
				setAttribute(line, "class", "svelte-o02ty2");
			},

			m(target, anchor) {
				insert(target, line, anchor);
			},

			p(changed, ctx) {
				if ((changed.calculatePlotX || changed.datasets) && line_x__value !== (line_x__value = "" + ctx.calculatePlotX(ctx.point.x) + "px")) {
					setAttribute(line, "x1", line_x__value);
				}

				if ((changed.calculatePlotX || changed.datasets) && line_x__value_1 !== (line_x__value_1 = "" + ctx.calculatePlotX(ctx.point.x) + "px")) {
					setAttribute(line, "x2", line_x__value_1);
				}

				if ((changed.topMargin || changed.plotYMargin || changed.plotHeight) && line_y__value !== (line_y__value = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight) + "px")) {
					setAttribute(line, "y1", line_y__value);
				}

				if ((changed.topMargin || changed.plotYMargin || changed.plotHeight || changed.tickLength) && line_y__value_1 !== (line_y__value_1 = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight + ctx.tickLength) + "px")) {
					setAttribute(line, "y2", line_y__value_1);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(line);
				}
			}
		};
	}

	// (132:1) {#if bottomFrame === 'ticks'}
	function create_if_block_6(component, ctx) {
		var g, g_stroke_width_value, g_stroke_opacity_value;

		var each_value_6 = ctx.datasets;

		var each_blocks = [];

		for (var i = 0; i < each_value_6.length; i += 1) {
			each_blocks[i] = create_each_block_6(component, get_each_context_5(ctx, each_value_6, i));
		}

		return {
			c() {
				g = createSvgElement("g");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				setAttribute(g, "stroke-width", g_stroke_width_value = "" + ctx.tickWidth + "px");
				setAttribute(g, "stroke-opacity", g_stroke_opacity_value = ctx.dataOpacity * 0.5);
			},

			m(target, anchor) {
				insert(target, g, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(g, null);
				}
			},

			p(changed, ctx) {
				if (changed.datasets || changed.calculatePlotX || changed.topMargin || changed.plotYMargin || changed.plotHeight || changed.tickLength) {
					each_value_6 = ctx.datasets;

					for (var i = 0; i < each_value_6.length; i += 1) {
						const child_ctx = get_each_context_5(ctx, each_value_6, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_6(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(g, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value_6.length;
				}

				if ((changed.tickWidth) && g_stroke_width_value !== (g_stroke_width_value = "" + ctx.tickWidth + "px")) {
					setAttribute(g, "stroke-width", g_stroke_width_value);
				}

				if ((changed.dataOpacity) && g_stroke_opacity_value !== (g_stroke_opacity_value = ctx.dataOpacity * 0.5)) {
					setAttribute(g, "stroke-opacity", g_stroke_opacity_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(g);
				}

				destroyEach(each_blocks, detach);
			}
		};
	}

	// (150:33) 
	function create_if_block_7(component, ctx) {
		var line, line_x__value, line_x__value_1, line_y__value, line_y__value_1;

		return {
			c() {
				line = createSvgElement("line");
				setAttribute(line, "x1", line_x__value = "" + ctx.calculatePlotX(ctx.minsAndMaxes.minX) + "px");
				setAttribute(line, "x2", line_x__value_1 = "" + ctx.calculatePlotX(ctx.minsAndMaxes.maxX) + "px");
				setAttribute(line, "y1", line_y__value = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight) + "px");
				setAttribute(line, "y2", line_y__value_1 = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight) + "px");
				setAttribute(line, "stroke", ctx.baseColor);
				setAttribute(line, "stroke-width", "1px");
				setAttribute(line, "class", "svelte-o02ty2");
			},

			m(target, anchor) {
				insert(target, line, anchor);
			},

			p(changed, ctx) {
				if ((changed.calculatePlotX || changed.minsAndMaxes) && line_x__value !== (line_x__value = "" + ctx.calculatePlotX(ctx.minsAndMaxes.minX) + "px")) {
					setAttribute(line, "x1", line_x__value);
				}

				if ((changed.calculatePlotX || changed.minsAndMaxes) && line_x__value_1 !== (line_x__value_1 = "" + ctx.calculatePlotX(ctx.minsAndMaxes.maxX) + "px")) {
					setAttribute(line, "x2", line_x__value_1);
				}

				if ((changed.topMargin || changed.plotYMargin || changed.plotHeight) && line_y__value !== (line_y__value = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight) + "px")) {
					setAttribute(line, "y1", line_y__value);
				}

				if ((changed.topMargin || changed.plotYMargin || changed.plotHeight) && line_y__value_1 !== (line_y__value_1 = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight) + "px")) {
					setAttribute(line, "y2", line_y__value_1);
				}

				if (changed.baseColor) {
					setAttribute(line, "stroke", ctx.baseColor);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(line);
				}
			}
		};
	}

	// (161:1) {#if hoveredPoint}
	function create_if_block_8(component, ctx) {
		var line, line_x__value, line_x__value_1, line_y__value, line_y__value_1, line_stroke_width_value, line_transition, line_1, line_1_x__value, line_1_x__value_1, line_1_y__value, line_1_y__value_1, line_1_stroke_width_value, line_1_transition, text, text_1_value = ctx.formatY(ctx.hoveredPoint.y), text_1, text_y_value, text_transition, text_2, text_3_value = ctx.formatX(ctx.hoveredPoint.x), text_3, text_2_x_value, text_2_transition, current;

		return {
			c() {
				line = createSvgElement("line");
				line_1 = createSvgElement("line");
				text = createSvgElement("text");
				text_1 = createText(text_1_value);
				text_2 = createSvgElement("text");
				text_3 = createText(text_3_value);
				setAttribute(line, "x1", line_x__value = "" + (ctx.leftMargin - ctx.plotXMargin - ctx.tickLength) + "px");
				setAttribute(line, "x2", line_x__value_1 = "" + (ctx.leftMargin - ctx.plotXMargin) + "px");
				setAttribute(line, "y1", line_y__value = "" + ctx.calculatePlotY(ctx.hoveredPoint.y) + "px");
				setAttribute(line, "y2", line_y__value_1 = "" + ctx.calculatePlotY(ctx.hoveredPoint.y) + "px");
				setAttribute(line, "stroke", ctx.hoveredColor);
				setAttribute(line, "stroke-width", line_stroke_width_value = "" + ctx.tickWidth * 2 + "px");
				setAttribute(line, "class", "svelte-o02ty2");
				setAttribute(line_1, "x1", line_1_x__value = "" + ctx.calculatePlotX(ctx.hoveredPoint.x) + "px");
				setAttribute(line_1, "x2", line_1_x__value_1 = "" + ctx.calculatePlotX(ctx.hoveredPoint.x) + "px");
				setAttribute(line_1, "y1", line_1_y__value = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight) + "px");
				setAttribute(line_1, "y2", line_1_y__value_1 = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight + ctx.tickLength) + "px");
				setAttribute(line_1, "stroke", ctx.hoveredColor);
				setAttribute(line_1, "stroke-width", line_1_stroke_width_value = "" + ctx.tickWidth * 2 + "px");
				setAttribute(line_1, "class", "svelte-o02ty2");
				setAttribute(text, "fill", ctx.hoveredColor);
				setStyle(text, "font-size", "" + ctx.fontSize + "px");
				setAttribute(text, "text-anchor", "end");
				setAttribute(text, "x", ctx.yLabelX);
				setAttribute(text, "y", text_y_value = ctx.calculatePlotY(ctx.hoveredPoint.y));
				setAttribute(text, "dy", "4");
				setAttribute(text_2, "fill", ctx.hoveredColor);
				setStyle(text_2, "font-size", "" + ctx.fontSize + "px");
				setAttribute(text_2, "text-anchor", "middle");
				setAttribute(text_2, "x", text_2_x_value = ctx.calculatePlotX(ctx.hoveredPoint.x));
				setAttribute(text_2, "y", ctx.xLabelY);
				setAttribute(text_2, "dy", ctx.fontSize);
			},

			m(target, anchor) {
				insert(target, line, anchor);
				insert(target, line_1, anchor);
				insert(target, text, anchor);
				append(text, text_1);
				insert(target, text_2, anchor);
				append(text_2, text_3);
				current = true;
			},

			p(changed, ctx) {
				if ((!current || changed.leftMargin || changed.plotXMargin || changed.tickLength) && line_x__value !== (line_x__value = "" + (ctx.leftMargin - ctx.plotXMargin - ctx.tickLength) + "px")) {
					setAttribute(line, "x1", line_x__value);
				}

				if ((!current || changed.leftMargin || changed.plotXMargin) && line_x__value_1 !== (line_x__value_1 = "" + (ctx.leftMargin - ctx.plotXMargin) + "px")) {
					setAttribute(line, "x2", line_x__value_1);
				}

				if ((!current || changed.calculatePlotY || changed.hoveredPoint) && line_y__value !== (line_y__value = "" + ctx.calculatePlotY(ctx.hoveredPoint.y) + "px")) {
					setAttribute(line, "y1", line_y__value);
				}

				if ((!current || changed.calculatePlotY || changed.hoveredPoint) && line_y__value_1 !== (line_y__value_1 = "" + ctx.calculatePlotY(ctx.hoveredPoint.y) + "px")) {
					setAttribute(line, "y2", line_y__value_1);
				}

				if (!current || changed.hoveredColor) {
					setAttribute(line, "stroke", ctx.hoveredColor);
				}

				if ((!current || changed.tickWidth) && line_stroke_width_value !== (line_stroke_width_value = "" + ctx.tickWidth * 2 + "px")) {
					setAttribute(line, "stroke-width", line_stroke_width_value);
				}

				if ((!current || changed.calculatePlotX || changed.hoveredPoint) && line_1_x__value !== (line_1_x__value = "" + ctx.calculatePlotX(ctx.hoveredPoint.x) + "px")) {
					setAttribute(line_1, "x1", line_1_x__value);
				}

				if ((!current || changed.calculatePlotX || changed.hoveredPoint) && line_1_x__value_1 !== (line_1_x__value_1 = "" + ctx.calculatePlotX(ctx.hoveredPoint.x) + "px")) {
					setAttribute(line_1, "x2", line_1_x__value_1);
				}

				if ((!current || changed.topMargin || changed.plotYMargin || changed.plotHeight) && line_1_y__value !== (line_1_y__value = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight) + "px")) {
					setAttribute(line_1, "y1", line_1_y__value);
				}

				if ((!current || changed.topMargin || changed.plotYMargin || changed.plotHeight || changed.tickLength) && line_1_y__value_1 !== (line_1_y__value_1 = "" + (ctx.topMargin + ctx.plotYMargin + ctx.plotHeight + ctx.tickLength) + "px")) {
					setAttribute(line_1, "y2", line_1_y__value_1);
				}

				if (!current || changed.hoveredColor) {
					setAttribute(line_1, "stroke", ctx.hoveredColor);
				}

				if ((!current || changed.tickWidth) && line_1_stroke_width_value !== (line_1_stroke_width_value = "" + ctx.tickWidth * 2 + "px")) {
					setAttribute(line_1, "stroke-width", line_1_stroke_width_value);
				}

				if ((!current || changed.formatY || changed.hoveredPoint) && text_1_value !== (text_1_value = ctx.formatY(ctx.hoveredPoint.y))) {
					setData(text_1, text_1_value);
				}

				if (!current || changed.hoveredColor) {
					setAttribute(text, "fill", ctx.hoveredColor);
				}

				if (!current || changed.fontSize) {
					setStyle(text, "font-size", "" + ctx.fontSize + "px");
				}

				if (!current || changed.yLabelX) {
					setAttribute(text, "x", ctx.yLabelX);
				}

				if ((!current || changed.calculatePlotY || changed.hoveredPoint) && text_y_value !== (text_y_value = ctx.calculatePlotY(ctx.hoveredPoint.y))) {
					setAttribute(text, "y", text_y_value);
				}

				if ((!current || changed.formatX || changed.hoveredPoint) && text_3_value !== (text_3_value = ctx.formatX(ctx.hoveredPoint.x))) {
					setData(text_3, text_3_value);
				}

				if (!current || changed.hoveredColor) {
					setAttribute(text_2, "fill", ctx.hoveredColor);
				}

				if (!current || changed.fontSize) {
					setStyle(text_2, "font-size", "" + ctx.fontSize + "px");
				}

				if ((!current || changed.calculatePlotX || changed.hoveredPoint) && text_2_x_value !== (text_2_x_value = ctx.calculatePlotX(ctx.hoveredPoint.x))) {
					setAttribute(text_2, "x", text_2_x_value);
				}

				if (!current || changed.xLabelY) {
					setAttribute(text_2, "y", ctx.xLabelY);
				}

				if (!current || changed.fontSize) {
					setAttribute(text_2, "dy", ctx.fontSize);
				}
			},

			i(target, anchor) {
				if (current) return;
				if (component.root._intro) {
					if (line_transition) line_transition.invalidate();

					component.root._aftercreate.push(() => {
						if (!line_transition) line_transition = wrapTransition(component, line, fade, {duration: 200}, true);
						line_transition.run(1);
					});
					if (line_1_transition) line_1_transition.invalidate();

					component.root._aftercreate.push(() => {
						if (!line_1_transition) line_1_transition = wrapTransition(component, line_1, fade, {duration: 200}, true);
						line_1_transition.run(1);
					});
					if (text_transition) text_transition.invalidate();

					component.root._aftercreate.push(() => {
						if (!text_transition) text_transition = wrapTransition(component, text, fade, {duration: 200}, true);
						text_transition.run(1);
					});
					if (text_2_transition) text_2_transition.invalidate();

					component.root._aftercreate.push(() => {
						if (!text_2_transition) text_2_transition = wrapTransition(component, text_2, fade, {duration: 200}, true);
						text_2_transition.run(1);
					});
				}
				this.m(target, anchor);
			},

			o(outrocallback) {
				if (!current) return;

				outrocallback = callAfter(outrocallback, 4);

				if (!line_transition) line_transition = wrapTransition(component, line, fade, {duration: 200}, false);
				line_transition.run(0, () => {
					outrocallback();
					line_transition = null;
				});

				if (!line_1_transition) line_1_transition = wrapTransition(component, line_1, fade, {duration: 200}, false);
				line_1_transition.run(0, () => {
					outrocallback();
					line_1_transition = null;
				});

				if (!text_transition) text_transition = wrapTransition(component, text, fade, {duration: 200}, false);
				text_transition.run(0, () => {
					outrocallback();
					text_transition = null;
				});

				if (!text_2_transition) text_2_transition = wrapTransition(component, text_2, fade, {duration: 200}, false);
				text_2_transition.run(0, () => {
					outrocallback();
					text_2_transition = null;
				});

				current = false;
			},

			d(detach) {
				if (detach) {
					detachNode(line);
					if (line_transition) line_transition.abort();
					detachNode(line_1);
					if (line_1_transition) line_1_transition.abort();
					detachNode(text);
					if (text_transition) text_transition.abort();
					detachNode(text_2);
					if (text_2_transition) text_2_transition.abort();
				}
			}
		};
	}

	function get_each_context(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.dataset = list[i];
		child_ctx.each_value = list;
		child_ctx.dataset_index = i;
		return child_ctx;
	}

	function get_each_context_1(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.point = list[i];
		child_ctx.each_value_1 = list;
		child_ctx.point_index = i;
		return child_ctx;
	}

	function get_each_context_2(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.dataset = list[i];
		child_ctx.each_value_2 = list;
		child_ctx.datasetIndex = i;
		return child_ctx;
	}

	function get_each_context_3(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.point = list[i];
		child_ctx.each_value_3 = list;
		child_ctx.pointIndex = i;
		return child_ctx;
	}

	function mousemove_handler(event) {
		const { component } = this._svelte;

		component.calculateBestHover(event);
	}

	function click_handler(event) {
		const { component, ctx } = this._svelte;

		component.hover(ctx.point, ctx.dataset);
	}

	function get_each_1_context(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.dataset = list[i];
		child_ctx.each_value_4 = list;
		child_ctx.datasetIndex = i;
		return child_ctx;
	}

	function get_each_context_4(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.point = list[i];
		child_ctx.each_value_5 = list;
		child_ctx.pointIndex = i;
		return child_ctx;
	}

	function mousemove_handler_1(event) {
		const { component } = this._svelte;

		component.calculateBestHover(event);
	}

	function click_handler_1(event) {
		const { component, ctx } = this._svelte;

		component.hover(ctx.point, ctx.dataset);
	}

	function mouseleave_handler(event) {
		const { component } = this._svelte;

		component.hover(null);
	}

	function get_each_context_5(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.dataset = list[i];
		child_ctx.each_value_6 = list;
		child_ctx.dataset_index_1 = i;
		return child_ctx;
	}

	function get_each_context_6(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.point = list[i];
		child_ctx.each_value_7 = list;
		child_ctx.point_index_1 = i;
		return child_ctx;
	}

	function ScatterGraph(options) {
		init(this, options);
		this.refs = {};
		this._state = assign(data(), options.data);
		this._recompute({ width: 1, leftMargin: 1, rightMargin: 1, height: 1, bottomMargin: 1, topMargin: 1, datasets: 1, minsAndMaxes: 1, plotWidth: 1, dataRanges: 1, plotHeight: 1, plotXMargin: 1, tickLength: 1, labelBuffer: 1, plotYMargin: 1, hoveredPoint: 1 }, this._state);
		this._intro = true;

		if (!document.getElementById("svelte-o02ty2-style")) add_css();

		this._fragment = create_main_fragment(this, this._state);

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}
	}

	assign(ScatterGraph.prototype, proto);
	assign(ScatterGraph.prototype, methods);

	ScatterGraph.prototype._recompute = function _recompute(changed, state) {
		if (changed.width || changed.leftMargin || changed.rightMargin) {
			if (this._differs(state.plotWidth, (state.plotWidth = plotWidth(state)))) changed.plotWidth = true;
		}

		if (changed.height || changed.bottomMargin || changed.topMargin) {
			if (this._differs(state.plotHeight, (state.plotHeight = plotHeight(state)))) changed.plotHeight = true;
		}

		if (changed.datasets) {
			if (this._differs(state.minsAndMaxes, (state.minsAndMaxes = minsAndMaxes(state)))) changed.minsAndMaxes = true;
		}

		if (changed.minsAndMaxes) {
			if (this._differs(state.dataRanges, (state.dataRanges = dataRanges(state)))) changed.dataRanges = true;
		}

		if (changed.leftMargin || changed.plotWidth || changed.minsAndMaxes || changed.dataRanges) {
			if (this._differs(state.calculatePlotX, (state.calculatePlotX = calculatePlotX(state)))) changed.calculatePlotX = true;
		}

		if (changed.plotHeight || changed.minsAndMaxes || changed.dataRanges || changed.topMargin) {
			if (this._differs(state.calculatePlotY, (state.calculatePlotY = calculatePlotY(state)))) changed.calculatePlotY = true;
		}

		if (changed.leftMargin || changed.plotXMargin || changed.tickLength || changed.labelBuffer) {
			if (this._differs(state.yLabelX, (state.yLabelX = yLabelX(state)))) changed.yLabelX = true;
		}

		if (changed.topMargin || changed.plotHeight || changed.plotYMargin || changed.tickLength || changed.labelBuffer) {
			if (this._differs(state.xLabelY, (state.xLabelY = xLabelY(state)))) changed.xLabelY = true;
		}

		if (changed.hoveredPoint) {
			if (this._differs(state.dataOpacity, (state.dataOpacity = dataOpacity(state)))) changed.dataOpacity = true;
		}
	};

	var GBP = [
		{
			date: "2000-04-01",
			usdCost: 3.00200000192128
		},
		{
			date: "2001-04-01",
			usdCost: 2.845700001223651
		},
		{
			date: "2002-04-01",
			usdCost: 2.8855000017313
		},
		{
			date: "2003-04-01",
			usdCost: 3.1442000020122878
		},
		{
			date: "2004-05-01",
			usdCost: 3.365199999259656
		},
		{
			date: "2005-06-01",
			usdCost: 3.4404000027179156
		},
		{
			date: "2006-01-01",
			usdCost: 3.3161319980909028
		},
		{
			date: "2006-05-01",
			usdCost: 3.647976002124581
		},
		{
			date: "2007-01-01",
			usdCost: 3.8337309995968827
		},
		{
			date: "2007-06-01",
			usdCost: 4.007163503499055
		},
		{
			date: "2008-06-01",
			usdCost: 4.5704965026351205
		},
		{
			date: "2009-07-01",
			usdCost: 3.688274000606352
		},
		{
			date: "2010-01-01",
			usdCost: 3.6713280000587414
		},
		{
			date: "2010-07-01",
			usdCost: 3.4835479999052477
		},
		{
			date: "2011-07-01",
			usdCost: 3.8916369997462654
		},
		{
			date: "2012-01-01",
			usdCost: 3.823395001772144
		},
		{
			date: "2012-07-01",
			usdCost: 4.162371500299899
		},
		{
			date: "2013-01-01",
			usdCost: 4.248182498028843
		},
		{
			date: "2013-07-01",
			usdCost: 4.020070499363623
		},
		{
			date: "2014-01-01",
			usdCost: 4.626796499883173
		},
		{
			date: "2014-07-01",
			usdCost: 4.925137996188928
		},
		{
			date: "2015-01-01",
			usdCost: 4.368234997403084
		},
		{
			date: "2015-07-01",
			usdCost: 4.512446002943017
		},
		{
			date: "2016-01-01",
			usdCost: 4.221856502320121
		},
		{
			date: "2016-07-01",
			usdCost: 3.9402219985909768
		},
		{
			date: "2017-01-01",
			usdCost: 3.728394002005876
		},
		{
			date: "2017-07-01",
			usdCost: 4.111431501606953
		},
		{
			date: "2018-01-01",
			usdCost: 4.413045998755521
		},
		{
			date: "2018-07-01",
			usdCost: 4.231534999999998
		}
	];
	var CAD = [
		{
			date: "2000-04-01",
			usdCost: 1.9387755102040818
		},
		{
			date: "2001-04-01",
			usdCost: 2.1346153846153846
		},
		{
			date: "2002-04-01",
			usdCost: 2.1210191082802545
		},
		{
			date: "2003-04-01",
			usdCost: 2.206896551724138
		},
		{
			date: "2004-05-01",
			usdCost: 2.3284671532846715
		},
		{
			date: "2005-06-01",
			usdCost: 2.6252601248599325
		},
		{
			date: "2006-01-01",
			usdCost: 3.007518796992481
		},
		{
			date: "2006-05-01",
			usdCost: 3.141594894908296
		},
		{
			date: "2007-01-01",
			usdCost: 3.089756139081585
		},
		{
			date: "2007-06-01",
			usdCost: 3.68313636147895
		},
		{
			date: "2008-06-01",
			usdCost: 4.07553186189029
		},
		{
			date: "2009-07-01",
			usdCost: 3.3509928069948747
		},
		{
			date: "2010-01-01",
			usdCost: 3.973765432098766
		},
		{
			date: "2010-07-01",
			usdCost: 4.00057562239171
		},
		{
			date: "2011-07-01",
			usdCost: 5.000792937569383
		},
		{
			date: "2012-01-01",
			usdCost: 4.63293990890837
		},
		{
			date: "2012-07-01",
			usdCost: 5.022315954681446
		},
		{
			date: "2013-01-01",
			usdCost: 5.3943563665370435
		},
		{
			date: "2013-07-01",
			usdCost: 5.260404280618312
		},
		{
			date: "2014-01-01",
			usdCost: 5.013120984526287
		},
		{
			date: "2014-07-01",
			usdCost: 5.251152180997161
		},
		{
			date: "2015-01-01",
			usdCost: 4.6396158072524525
		},
		{
			date: "2015-07-01",
			usdCost: 4.535938590369853
		},
		{
			date: "2016-01-01",
			usdCost: 4.144195288106727
		},
		{
			date: "2016-07-01",
			usdCost: 4.604758250191865
		},
		{
			date: "2017-01-01",
			usdCost: 4.509803921568627
		},
		{
			date: "2017-07-01",
			usdCost: 4.655696794821805
		},
		{
			date: "2018-01-01",
			usdCost: 5.257243759531263
		},
		{
			date: "2018-07-01",
			usdCost: 5.06724578047015
		}
	];
	var USD = [
		{
			date: "2000-04-01",
			usdCost: 2.51
		},
		{
			date: "2001-04-01",
			usdCost: 2.54
		},
		{
			date: "2002-04-01",
			usdCost: 2.49
		},
		{
			date: "2003-04-01",
			usdCost: 2.71
		},
		{
			date: "2004-05-01",
			usdCost: 2.9
		},
		{
			date: "2005-06-01",
			usdCost: 3.06
		},
		{
			date: "2006-01-01",
			usdCost: 3.15
		},
		{
			date: "2006-05-01",
			usdCost: 3.1
		},
		{
			date: "2007-01-01",
			usdCost: 3.22
		},
		{
			date: "2007-06-01",
			usdCost: 3.41
		},
		{
			date: "2008-06-01",
			usdCost: 3.57
		},
		{
			date: "2009-07-01",
			usdCost: 3.57
		},
		{
			date: "2010-01-01",
			usdCost: 3.58
		},
		{
			date: "2010-07-01",
			usdCost: 3.733333333
		},
		{
			date: "2011-07-01",
			usdCost: 4.065
		},
		{
			date: "2012-01-01",
			usdCost: 4.19722
		},
		{
			date: "2012-07-01",
			usdCost: 4.3275
		},
		{
			date: "2013-01-01",
			usdCost: 4.367395833
		},
		{
			date: "2013-07-01",
			usdCost: 4.556666667
		},
		{
			date: "2014-01-01",
			usdCost: 4.624166667
		},
		{
			date: "2014-07-01",
			usdCost: 4.795
		},
		{
			date: "2015-01-01",
			usdCost: 4.79
		},
		{
			date: "2015-07-01",
			usdCost: 4.79
		},
		{
			date: "2016-01-01",
			usdCost: 4.93
		},
		{
			date: "2016-07-01",
			usdCost: 5.04
		},
		{
			date: "2017-01-01",
			usdCost: 5.06
		},
		{
			date: "2017-07-01",
			usdCost: 5.3
		},
		{
			date: "2018-01-01",
			usdCost: 5.28
		},
		{
			date: "2018-07-01",
			usdCost: 5.51
		}
	];
	var bigMacData = {
		GBP: GBP,
		CAD: CAD,
		USD: USD
	};

	var regexSource = regex => regex instanceof RegExp ? regex.source : regex;

	const closingCharacters = {
		'(': ')',
		'[': ']',
	};

	var isAtomic = function isAtomic(regex) {
		const string = regexSource(regex);

		return /^\w$/.test(string) || enclosedByTopLevelCharacters(string)
	};

	function enclosedByTopLevelCharacters(string) {
		const openingCharacter = string[0];
		const closingCharacter = closingCharacters[openingCharacter];


		const closedByAppropriateCharacter = closingCharacter !== undefined
			&& string[string.length - 1] === closingCharacter;


		if (!closedByAppropriateCharacter) {
			return false
		}

		return !isClosedBeforeEndOfString(0, string, openingCharacter, closingCharacter)
	}


	function isClosedBeforeEndOfString(depth, string, openingCharacter, closingCharacter) {
		if (string.length === 1 && string[0] === closingCharacter && depth === 1) {
			return false
		}
		const [ nextCharacter, ...restOfCharacters ] = string;
		const newDepth = calculateNewDepth(depth, openingCharacter, closingCharacter, nextCharacter);

		if (newDepth === 0) {
			return true
		}

		return isClosedBeforeEndOfString(newDepth, restOfCharacters, openingCharacter, closingCharacter)
	}

	function calculateNewDepth(previousDepth, openingCharacter, closingCharacter, character) {
		if (character === openingCharacter) {
			return previousDepth + 1
		} else if (character === closingCharacter) {
			return previousDepth - 1
		} else {
			return previousDepth
		}
	}

	const combine = returnsRegex((...args) => escapeInputForCombining(...args).join(''));
	const guaranteeAtomic = regex => isAtomic(regex) ? regex : `(?:${regexSource(regex)})`;
	const escapeRegex = str => str.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&');
	const ifRegex = (input, ifCase, elseIfCase) => input instanceof RegExp ? ifCase(input) : elseIfCase(input);
	const escapeInputAndReturnString = regex => ifRegex(regex, regex => regex.source, escapeRegex);

	var regexFun = {
		combine,
		either: makeJoiningFunction('(?:', '|', ')'),
		capture: makeJoiningFunction('(', '', ')'),

		flags: (flags, ...args) => new RegExp(combine(...args).source, flags),

		anyNumber: suffix('*'),
		oneOrMore: suffix('+'),
		optional: suffix('?'),
		exactly: (n, ...regexes) => suffix(`{${n}}`)(...regexes),
		atLeast: (n, ...regexes) => suffix(`{${n},}`)(...regexes),
		between: (n, m, ...regexes) => suffix(`{${n},${m}}`)(...regexes),

		anyNumberNonGreedy: suffix('*?'),
		oneOrMoreNonGreedy: suffix('+?'),
		optionalNonGreedy: suffix('??'),
		exactlyNonGreedy: (n, ...regexes) => suffix(`{${n}}?`)(...regexes),
		atLeastNonGreedy: (n, ...regexes) => suffix(`{${n},}?`)(...regexes),
		betweenNonGreedy: (n, m, ...regexes) => suffix(`{${n},${m}}?`)(...regexes),
	};

	function removeNonCapturingGroupIfExists(regexString) {
		const match = /^\(\?:(.+)\)$/.exec(regexString);
		return match ? match[1] : regexString
	}

	function guaranteeNoTopLevelOrs(regexString) {
		return regexString.indexOf('|') >= 0 ? guaranteeAtomic(regexString) : regexString
	}

	function escapeInputForCombining(...args) {
		return args.map(escapeInputAndReturnString).map(guaranteeNoTopLevelOrs)
	}

	function returnsRegex(fn) {
		return (...args) => ifRegex(fn(...args), regex => regex, input => new RegExp(input))
	}

	function makeJoiningFunction(openingCharacter, joinCharacter, closingCharacter) {
		return returnsRegex((...args) => {
			const naiveBody = escapeInputForCombining(...args).join(joinCharacter);
			const body = isAtomic(naiveBody) ? removeNonCapturingGroupIfExists(naiveBody) : naiveBody;

			return concat(openingCharacter, body, closingCharacter)
		})
	}

	function suffix(appendCharacter) {
		return returnsRegex((...args) => concat(guaranteeAtomic(combine(...args)), appendCharacter))
	}

	function concat(...regexes) {
		return regexes.map(regexSource).join('')
	}

	var basicXhr = function makeXhrFunction(inputOptions) {
		var options = Object.assign({
			method: 'GET',
			success: defaultSuccess,
			parse: defaultParse,
			serialize: defaultSerialize,
			headers: {},
		}, inputOptions);

		return function xhr(url, body) {
			return new Promise(function promise(resolve, reject) {
				var request = new XMLHttpRequest();
				request.addEventListener('load', handleResult);
				request.addEventListener('error', reject);
				request.addEventListener('abort', reject);
				request.open(options.method, url);

				Object.keys(options.headers).forEach(function(key) {
					request.setRequestHeader(key, options.headers[key]);
				});

				if (typeof body === 'undefined') {
					request.send();
				} else {
					request.send(options.serialize(body));
				}

				function handleResult() {
					try {
						var response = options.parse(request);

						options.success(request) ? resolve(response) : reject(response);
					} catch (e) {
						reject(e);
					}
				}
			})
		}
	};

	function defaultSuccess(request) {
		return request.status >= 200 && request.status < 400
	}

	function defaultSerialize(body) {
		return JSON.stringify(body)
	}

	function defaultParse(request) {
		return JSON.parse(request.responseText)
	}

	function createCommonjsModule(fn, module) {
		return module = { exports: {} }, fn(module, module.exports), module.exports;
	}

	var urlBuilder = {
		buildIndexUrl: function buildIndexUrl(key) {
			return "https://spreadsheets.google.com/feeds/worksheets/" + key + "/public/basic?alt=json";
		},
		buildSheetUrl: function buildSheetUrl(key, sheetId) {
			return "https://spreadsheets.google.com/feeds/list/" + key + "/" + sheetId + "/public/values?alt=json";
		}
	};

	var orderedEntries = function orderedEntries(o) {
		return Object.getOwnPropertyNames(o).map(function(key) {
			return [ key, o[key] ]
		})
	};

	var slicedToArray = function () {
	  function sliceIterator(arr, i) {
	    var _arr = [];
	    var _n = true;
	    var _d = false;
	    var _e = undefined;

	    try {
	      for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
	        _arr.push(_s.value);

	        if (i && _arr.length === i) break;
	      }
	    } catch (err) {
	      _d = true;
	      _e = err;
	    } finally {
	      try {
	        if (!_n && _i["return"]) _i["return"]();
	      } finally {
	        if (_d) throw _e;
	      }
	    }

	    return _arr;
	  }

	  return function (arr, i) {
	    if (Array.isArray(arr)) {
	      return arr;
	    } else if (Symbol.iterator in Object(arr)) {
	      return sliceIterator(arr, i);
	    } else {
	      throw new TypeError("Invalid attempt to destructure non-iterable instance");
	    }
	  };
	}();

	var sheetsy = createCommonjsModule(function (module) {
		var buildIndexUrl = urlBuilder.buildIndexUrl,
		    buildSheetUrl = urlBuilder.buildSheetUrl;


		module.exports = function (defaultGet) {
			function getWorkbook(key) {
				var get$$1 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : defaultGet;

				return get$$1(buildIndexUrl(key)).then(function (workbookData) {
					var feed = workbookData.feed;
					var sheets = feed.entry.map(function (sheetData) {
						var selfSheetUrl = sheetData.link.find(function (link) {
							return link.rel === 'self';
						}).href;
						return {
							name: textOf(sheetData.title),
							id: afterLastSlash(selfSheetUrl),
							updated: textOf(sheetData.updated)
						};
					});

					return {
						name: textOf(feed.title),
						updated: textOf(feed.updated),
						authors: getAuthors(feed),
						sheets: sheets
					};
				});
			}

			function getSheet(key, id) {
				var get$$1 = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : defaultGet;

				return get$$1(buildSheetUrl(key, id)).then(function (sheetData) {
					var feed = sheetData.feed;
					var rows = feed.entry.map(function (entry) {
						var originalCellKeysAndValues = orderedEntries(entry).filter(function (_ref) {
							var _ref2 = slicedToArray(_ref, 1),
							    key = _ref2[0];

							return (/^gsx\$/.test(key)
							);
						}).map(function (_ref3) {
							var _ref4 = slicedToArray(_ref3, 2),
							    key = _ref4[0],
							    value = _ref4[1];

							return {
								key: key.replace('gsx$', ''),
								value: textOf(value)
							};
						});

						var array = originalCellKeysAndValues.map(function (_ref5) {
							var value = _ref5.value;
							return value;
						});

						originalCellKeysAndValues.filter(function (_ref6) {
							var key = _ref6.key;
							return (/^[^_]/.test(key)
							);
						}).forEach(function (_ref7) {
							var key = _ref7.key,
							    value = _ref7.value;

							array[key] = value;
						});

						return array;
					});

					return {
						name: textOf(feed.title),
						updated: textOf(feed.updated),
						authors: getAuthors(feed),
						rows: rows
					};
				});
			}

			function urlToKey(url) {
				return firstCapture(/key=(.*?)(&|#|$)/, url) || firstCapture(/d\/(.*?)\/pubhtml/, url) || firstCapture(/spreadsheets\/d\/(.*?)\//, url) || toss('No key found in ' + url);
			}

			return {
				getWorkbook: getWorkbook,
				getSheet: getSheet,
				urlToKey: urlToKey
			};
		};

		var textOf = function textOf(field) {
			return field.$t;
		};

		var getAuthors = function getAuthors(data) {
			return data.author.map(function (_ref8) {
				var name = _ref8.name,
				    email = _ref8.email;
				return {
					name: textOf(name),
					email: textOf(email)
				};
			});
		};

		var afterLastSlash = function afterLastSlash(str) {
			return str.split('/').pop();
		};

		var firstCapture = function firstCapture(regex, str) {
			var match = regex.exec(str);
			return match && match[1];
		};

		var toss = function toss(message) {
			throw new Error(message);
		};
	});

	var indexBrowser = sheetsy(basicXhr());

	var browserBuild = indexBrowser;

	/**
	 * @category Common Helpers
	 * @summary Is the given argument an instance of Date?
	 *
	 * @description
	 * Is the given argument an instance of Date?
	 *
	 * @param {*} argument - the argument to check
	 * @returns {Boolean} the given argument is an instance of Date
	 *
	 * @example
	 * // Is 'mayonnaise' a Date?
	 * var result = isDate('mayonnaise')
	 * //=> false
	 */
	function isDate (argument) {
	  return argument instanceof Date
	}

	var is_date = isDate;

	var MILLISECONDS_IN_HOUR = 3600000;
	var MILLISECONDS_IN_MINUTE = 60000;
	var DEFAULT_ADDITIONAL_DIGITS = 2;

	var parseTokenDateTimeDelimeter = /[T ]/;
	var parseTokenPlainTime = /:/;

	// year tokens
	var parseTokenYY = /^(\d{2})$/;
	var parseTokensYYY = [
	  /^([+-]\d{2})$/, // 0 additional digits
	  /^([+-]\d{3})$/, // 1 additional digit
	  /^([+-]\d{4})$/ // 2 additional digits
	];

	var parseTokenYYYY = /^(\d{4})/;
	var parseTokensYYYYY = [
	  /^([+-]\d{4})/, // 0 additional digits
	  /^([+-]\d{5})/, // 1 additional digit
	  /^([+-]\d{6})/ // 2 additional digits
	];

	// date tokens
	var parseTokenMM = /^-(\d{2})$/;
	var parseTokenDDD = /^-?(\d{3})$/;
	var parseTokenMMDD = /^-?(\d{2})-?(\d{2})$/;
	var parseTokenWww = /^-?W(\d{2})$/;
	var parseTokenWwwD = /^-?W(\d{2})-?(\d{1})$/;

	// time tokens
	var parseTokenHH = /^(\d{2}([.,]\d*)?)$/;
	var parseTokenHHMM = /^(\d{2}):?(\d{2}([.,]\d*)?)$/;
	var parseTokenHHMMSS = /^(\d{2}):?(\d{2}):?(\d{2}([.,]\d*)?)$/;

	// timezone tokens
	var parseTokenTimezone = /([Z+-].*)$/;
	var parseTokenTimezoneZ = /^(Z)$/;
	var parseTokenTimezoneHH = /^([+-])(\d{2})$/;
	var parseTokenTimezoneHHMM = /^([+-])(\d{2}):?(\d{2})$/;

	/**
	 * @category Common Helpers
	 * @summary Convert the given argument to an instance of Date.
	 *
	 * @description
	 * Convert the given argument to an instance of Date.
	 *
	 * If the argument is an instance of Date, the function returns its clone.
	 *
	 * If the argument is a number, it is treated as a timestamp.
	 *
	 * If an argument is a string, the function tries to parse it.
	 * Function accepts complete ISO 8601 formats as well as partial implementations.
	 * ISO 8601: http://en.wikipedia.org/wiki/ISO_8601
	 *
	 * If all above fails, the function passes the given argument to Date constructor.
	 *
	 * @param {Date|String|Number} argument - the value to convert
	 * @param {Object} [options] - the object with options
	 * @param {0 | 1 | 2} [options.additionalDigits=2] - the additional number of digits in the extended year format
	 * @returns {Date} the parsed date in the local time zone
	 *
	 * @example
	 * // Convert string '2014-02-11T11:30:30' to date:
	 * var result = parse('2014-02-11T11:30:30')
	 * //=> Tue Feb 11 2014 11:30:30
	 *
	 * @example
	 * // Parse string '+02014101',
	 * // if the additional number of digits in the extended year format is 1:
	 * var result = parse('+02014101', {additionalDigits: 1})
	 * //=> Fri Apr 11 2014 00:00:00
	 */
	function parse (argument, dirtyOptions) {
	  if (is_date(argument)) {
	    // Prevent the date to lose the milliseconds when passed to new Date() in IE10
	    return new Date(argument.getTime())
	  } else if (typeof argument !== 'string') {
	    return new Date(argument)
	  }

	  var options = dirtyOptions || {};
	  var additionalDigits = options.additionalDigits;
	  if (additionalDigits == null) {
	    additionalDigits = DEFAULT_ADDITIONAL_DIGITS;
	  } else {
	    additionalDigits = Number(additionalDigits);
	  }

	  var dateStrings = splitDateString(argument);

	  var parseYearResult = parseYear(dateStrings.date, additionalDigits);
	  var year = parseYearResult.year;
	  var restDateString = parseYearResult.restDateString;

	  var date = parseDate(restDateString, year);

	  if (date) {
	    var timestamp = date.getTime();
	    var time = 0;
	    var offset;

	    if (dateStrings.time) {
	      time = parseTime(dateStrings.time);
	    }

	    if (dateStrings.timezone) {
	      offset = parseTimezone(dateStrings.timezone);
	    } else {
	      // get offset accurate to hour in timezones that change offset
	      offset = new Date(timestamp + time).getTimezoneOffset();
	      offset = new Date(timestamp + time + offset * MILLISECONDS_IN_MINUTE).getTimezoneOffset();
	    }

	    return new Date(timestamp + time + offset * MILLISECONDS_IN_MINUTE)
	  } else {
	    return new Date(argument)
	  }
	}

	function splitDateString (dateString) {
	  var dateStrings = {};
	  var array = dateString.split(parseTokenDateTimeDelimeter);
	  var timeString;

	  if (parseTokenPlainTime.test(array[0])) {
	    dateStrings.date = null;
	    timeString = array[0];
	  } else {
	    dateStrings.date = array[0];
	    timeString = array[1];
	  }

	  if (timeString) {
	    var token = parseTokenTimezone.exec(timeString);
	    if (token) {
	      dateStrings.time = timeString.replace(token[1], '');
	      dateStrings.timezone = token[1];
	    } else {
	      dateStrings.time = timeString;
	    }
	  }

	  return dateStrings
	}

	function parseYear (dateString, additionalDigits) {
	  var parseTokenYYY = parseTokensYYY[additionalDigits];
	  var parseTokenYYYYY = parseTokensYYYYY[additionalDigits];

	  var token;

	  // YYYY or ±YYYYY
	  token = parseTokenYYYY.exec(dateString) || parseTokenYYYYY.exec(dateString);
	  if (token) {
	    var yearString = token[1];
	    return {
	      year: parseInt(yearString, 10),
	      restDateString: dateString.slice(yearString.length)
	    }
	  }

	  // YY or ±YYY
	  token = parseTokenYY.exec(dateString) || parseTokenYYY.exec(dateString);
	  if (token) {
	    var centuryString = token[1];
	    return {
	      year: parseInt(centuryString, 10) * 100,
	      restDateString: dateString.slice(centuryString.length)
	    }
	  }

	  // Invalid ISO-formatted year
	  return {
	    year: null
	  }
	}

	function parseDate (dateString, year) {
	  // Invalid ISO-formatted year
	  if (year === null) {
	    return null
	  }

	  var token;
	  var date;
	  var month;
	  var week;

	  // YYYY
	  if (dateString.length === 0) {
	    date = new Date(0);
	    date.setUTCFullYear(year);
	    return date
	  }

	  // YYYY-MM
	  token = parseTokenMM.exec(dateString);
	  if (token) {
	    date = new Date(0);
	    month = parseInt(token[1], 10) - 1;
	    date.setUTCFullYear(year, month);
	    return date
	  }

	  // YYYY-DDD or YYYYDDD
	  token = parseTokenDDD.exec(dateString);
	  if (token) {
	    date = new Date(0);
	    var dayOfYear = parseInt(token[1], 10);
	    date.setUTCFullYear(year, 0, dayOfYear);
	    return date
	  }

	  // YYYY-MM-DD or YYYYMMDD
	  token = parseTokenMMDD.exec(dateString);
	  if (token) {
	    date = new Date(0);
	    month = parseInt(token[1], 10) - 1;
	    var day = parseInt(token[2], 10);
	    date.setUTCFullYear(year, month, day);
	    return date
	  }

	  // YYYY-Www or YYYYWww
	  token = parseTokenWww.exec(dateString);
	  if (token) {
	    week = parseInt(token[1], 10) - 1;
	    return dayOfISOYear(year, week)
	  }

	  // YYYY-Www-D or YYYYWwwD
	  token = parseTokenWwwD.exec(dateString);
	  if (token) {
	    week = parseInt(token[1], 10) - 1;
	    var dayOfWeek = parseInt(token[2], 10) - 1;
	    return dayOfISOYear(year, week, dayOfWeek)
	  }

	  // Invalid ISO-formatted date
	  return null
	}

	function parseTime (timeString) {
	  var token;
	  var hours;
	  var minutes;

	  // hh
	  token = parseTokenHH.exec(timeString);
	  if (token) {
	    hours = parseFloat(token[1].replace(',', '.'));
	    return (hours % 24) * MILLISECONDS_IN_HOUR
	  }

	  // hh:mm or hhmm
	  token = parseTokenHHMM.exec(timeString);
	  if (token) {
	    hours = parseInt(token[1], 10);
	    minutes = parseFloat(token[2].replace(',', '.'));
	    return (hours % 24) * MILLISECONDS_IN_HOUR +
	      minutes * MILLISECONDS_IN_MINUTE
	  }

	  // hh:mm:ss or hhmmss
	  token = parseTokenHHMMSS.exec(timeString);
	  if (token) {
	    hours = parseInt(token[1], 10);
	    minutes = parseInt(token[2], 10);
	    var seconds = parseFloat(token[3].replace(',', '.'));
	    return (hours % 24) * MILLISECONDS_IN_HOUR +
	      minutes * MILLISECONDS_IN_MINUTE +
	      seconds * 1000
	  }

	  // Invalid ISO-formatted time
	  return null
	}

	function parseTimezone (timezoneString) {
	  var token;
	  var absoluteOffset;

	  // Z
	  token = parseTokenTimezoneZ.exec(timezoneString);
	  if (token) {
	    return 0
	  }

	  // ±hh
	  token = parseTokenTimezoneHH.exec(timezoneString);
	  if (token) {
	    absoluteOffset = parseInt(token[2], 10) * 60;
	    return (token[1] === '+') ? -absoluteOffset : absoluteOffset
	  }

	  // ±hh:mm or ±hhmm
	  token = parseTokenTimezoneHHMM.exec(timezoneString);
	  if (token) {
	    absoluteOffset = parseInt(token[2], 10) * 60 + parseInt(token[3], 10);
	    return (token[1] === '+') ? -absoluteOffset : absoluteOffset
	  }

	  return 0
	}

	function dayOfISOYear (isoYear, week, day) {
	  week = week || 0;
	  day = day || 0;
	  var date = new Date(0);
	  date.setUTCFullYear(isoYear, 0, 4);
	  var fourthOfJanuaryDay = date.getUTCDay() || 7;
	  var diff = week * 7 + day + 1 - fourthOfJanuaryDay;
	  date.setUTCDate(date.getUTCDate() + diff);
	  return date
	}

	var parse_1 = parse;

	/**
	 * @category Month Helpers
	 * @summary Get the number of days in a month of the given date.
	 *
	 * @description
	 * Get the number of days in a month of the given date.
	 *
	 * @param {Date|String|Number} date - the given date
	 * @returns {Number} the number of days in a month
	 *
	 * @example
	 * // How many days are in February 2000?
	 * var result = getDaysInMonth(new Date(2000, 1))
	 * //=> 29
	 */
	function getDaysInMonth (dirtyDate) {
	  var date = parse_1(dirtyDate);
	  var year = date.getFullYear();
	  var monthIndex = date.getMonth();
	  var lastDayOfMonth = new Date(0);
	  lastDayOfMonth.setFullYear(year, monthIndex + 1, 0);
	  lastDayOfMonth.setHours(0, 0, 0, 0);
	  return lastDayOfMonth.getDate()
	}

	var get_days_in_month = getDaysInMonth;

	/**
	 * @category Month Helpers
	 * @summary Add the specified number of months to the given date.
	 *
	 * @description
	 * Add the specified number of months to the given date.
	 *
	 * @param {Date|String|Number} date - the date to be changed
	 * @param {Number} amount - the amount of months to be added
	 * @returns {Date} the new date with the months added
	 *
	 * @example
	 * // Add 5 months to 1 September 2014:
	 * var result = addMonths(new Date(2014, 8, 1), 5)
	 * //=> Sun Feb 01 2015 00:00:00
	 */
	function addMonths (dirtyDate, dirtyAmount) {
	  var date = parse_1(dirtyDate);
	  var amount = Number(dirtyAmount);
	  var desiredMonth = date.getMonth() + amount;
	  var dateWithDesiredMonth = new Date(0);
	  dateWithDesiredMonth.setFullYear(date.getFullYear(), desiredMonth, 1);
	  dateWithDesiredMonth.setHours(0, 0, 0, 0);
	  var daysInMonth = get_days_in_month(dateWithDesiredMonth);
	  // Set the last day of the new month
	  // if the original date was the last day of the longer month
	  date.setMonth(desiredMonth, Math.min(daysInMonth, date.getDate()));
	  return date
	}

	var add_months = addMonths;

	/**
	 * @category Month Helpers
	 * @summary Subtract the specified number of months from the given date.
	 *
	 * @description
	 * Subtract the specified number of months from the given date.
	 *
	 * @param {Date|String|Number} date - the date to be changed
	 * @param {Number} amount - the amount of months to be subtracted
	 * @returns {Date} the new date with the months subtracted
	 *
	 * @example
	 * // Subtract 5 months from 1 February 2015:
	 * var result = subMonths(new Date(2015, 1, 1), 5)
	 * //=> Mon Sep 01 2014 00:00:00
	 */
	function subMonths (dirtyDate, dirtyAmount) {
	  var amount = Number(dirtyAmount);
	  return add_months(dirtyDate, -amount)
	}

	var sub_months = subMonths;

	const { getSheet } = browserBuild;

	const pad2 = number => number < 10 ? `0` + number : number;
	const formatNumberAsDate = timestamp => {
		const date = new Date(timestamp);
		return `${ date.getFullYear() }-${ pad2(date.getMonth() + 1) }-${ pad2(date.getDate()) }`
	};

	async function main() {
		setUpWeightGraph(document);

		setUpBigMacGraph(document);
	}

	main();

	async function setUpWeightGraph(doc) {
		const points = await getWeightDataPoints();

		const weightRadioButtons = doc.querySelectorAll(`input[name=weight]`);

		const getCurrentDataset = () => {
			const currentlyChecked = Array.prototype.filter.call(weightRadioButtons, input => input.checked)
				.reduce((_, input) => input.value, `year`);
			return {
				color: `#139090`,
				points: points[currentlyChecked],
			}
		};

		const graph = new ScatterGraph({
			target: doc.getElementById(`graph-target`),
			data: {
				datasets: [ getCurrentDataset() ],
				bottomFrame: `ticks`,
				leftFrame: `ticks`,
				formatX: formatNumberAsDate,
				formatY: y => `${ y.toFixed(1) }lb`,
			},
		});

		doc.body.dataset.weightLoaded = true;

		weightRadioButtons.forEach(element => {
			element.addEventListener(`change`, () => {
				if (element.checked) {
					graph.set({
						datasets: [ getCurrentDataset() ],
					});
				}
			});
		});
	}

	function setUpBigMacGraph(doc) {
		const colors = {
			CAD: `var(--cadColor)`,
			GBP: `var(--gbpColor)`,
			USD: `var(--usdColor)`,
		};

		const bigMacDatasets = Object.keys(bigMacData).map(
			currency => ({
				color: colors[currency],
				points: bigMacData[currency].map(
					({ date, usdCost }) => ({
						x: new Date(date).valueOf(),
						y: usdCost,
					})
				),
			})
		);

		new ScatterGraph({
			target: doc.getElementById(`big-mac-target`),
			data: {
				datasets: bigMacDatasets,
				formatX: formatNumberAsDate,
				formatY: y => y.toFixed(2),
				bottomFrame: `line`,
			},
		});
	}

	async function getWeightDataPoints() {
		const documentId = `1ZFNKaLeZBkx3RmrKiv_qihhVphaNnnjEehhuRfir08U`;
		const sheet1Id = `ouieeg5`;

		const digits = /(\d+)/;
		const stupidDate = regexFun.combine(/^/, digits, `/`, digits, `/`, digits, ` `, digits, `:`, digits, `:`, digits, /$/);
		const mostlyIsoDate = regexFun.combine(/^/, digits, `-`, digits, `-`, digits, ` `, digits, `:`, digits, /$/);
		const toDate = (...stringParams) => new Date(...stringParams.map(str => parseInt(str, 10))).valueOf();
		const parseStupidDateOrIso = dateString => {
			const match = dateString.match(stupidDate);
			if (match) {
				const [ , month, day, year, hour, minute, second ] = match;
				return toDate(year, month, day, hour, minute, second)
			} else {
				const [ , year, month, day, hour, minute ] = dateString.match(mostlyIsoDate);
				return toDate(year, month, day, hour, minute)
			}
		};



		const sheet = await getSheet(documentId, sheet1Id);

		const allPoints = sheet.rows.map(({ timestamp, weight }) => ({
			x: parseStupidDateOrIso(timestamp),
			y: parseFloat(weight),
		}));

		const now = new Date();
		const yearAgo = sub_months(now, 12).valueOf();
		const threeMonthsAgo = sub_months(now, 3).valueOf();

		const year = allPoints.filter(({ x: timestamp }) => timestamp > yearAgo);

		return {
			year,
			threeMonths: year.filter(({ x: timestamp }) => timestamp > threeMonthsAgo),
		}
	}

}());
//# sourceMappingURL=bundle.js.map
