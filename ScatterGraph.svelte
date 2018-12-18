<script>
import fade from 'svelte-transitions-fade'
import w from 'warg'

const max = (maybeNull, number) => maybeNull === null ? number : Math.max(maybeNull, number)
const min = (maybeNull, number) => maybeNull === null ? number : Math.min(maybeNull, number)

const identity = value => value
const flatten = ary => [].concat(...ary)

const overlapsY = (svgElement, y) => {
	const labelBox = svgElement.getBBox()
	return (labelBox.y + (labelBox.height * 1.5)) >= y
		&& (labelBox.y - (labelBox.height * 0.5)) <= y
}
const overlapsX = (svgElement, x) => {
	const labelBox = svgElement.getBBox()
	return (labelBox.x - (labelBox.width * 0.5)) <= x
		&& (labelBox.x + (labelBox.width * 1.5)) >= x
}

const refs = {}

export let leftMargin = 100
export let rightMargin = 50
export let topMargin = 40
export let bottomMargin = 60

export let width = 600
export let height = 300

export let bottomFrame = `ticks`
export let leftFrame = `ticks`
export let pointSize = 2
export let tickLength = 10
export let tickWidth = 0.8
export let labelBuffer = 4

export let datasets = [{
	points: [],
	color: `black`,
}]
export let formatX = identity
export let formatY = identity
export let plotYMargin = 20
export let plotXMargin = 20

export let fontSize = 16
export let baseColor = `#333333`

export let hoveredPoint = null
export let hoveredColor = null
export let hoverOverlaps = {}

const width$ = w.value(width)
const leftMargin$ = w.value(leftMargin)
const rightMargin$ = w.value(rightMargin)
const height$ = w.value(height)
const bottomMargin$ = w.value(bottomMargin)
const topMargin$ = w.value(topMargin)
const plotXMargin$ = w.value(plotXMargin)
const tickLength$ = w.value(tickLength)
const labelBuffer$ = w.value(labelBuffer)
const plotYMargin$ = w.value(plotYMargin)
const hoveredPoint$ = w.value(hoveredPoint)
const datasets$ = w.value(datasets)

$: width$.set(width)
$: leftMargin$.set(leftMargin)
$: rightMargin$.set(rightMargin)
$: height$.set(height)
$: bottomMargin$.set(bottomMargin)
$: topMargin$.set(topMargin)
$: plotXMargin$.set(plotXMargin)
$: tickLength$.set(tickLength)
$: labelBuffer$.set(labelBuffer)
$: plotYMargin$.set(plotYMargin)
$: hoveredPoint$.set(hoveredPoint)
$: datasets$.set(datasets)

function calculateBestHover(event) {
	const { clientX, clientY } = event

	let cursorIsDirectlyOverPoints = false
	const relevantPoints = document.elementsFromPoint(clientX, clientY).filter(element => {
		cursorIsDirectlyOverPoints = cursorIsDirectlyOverPoints || !!element.dataset.actualPoint
		return `pointIndex` in element.dataset && `datasetIndex` in element.dataset
	}).filter(
		element => cursorIsDirectlyOverPoints ? element.dataset.actualPoint : !element.dataset.actualPoint
	)

	const setHoverPoint = element => {
		const datasetIndex = parseInt(element.dataset.datasetIndex, 10)
		const pointIndex = parseInt(element.dataset.pointIndex, 10)
		const dataset = datasets[datasetIndex]
		const point = dataset.points[pointIndex]
		if (point !== hoveredPoint) {
			hover(point, dataset)
		}
	}

	if (relevantPoints.length === 1) {
		setHoverPoint(relevantPoints[0])
	} else if (relevantPoints.length > 1) {
		const pointsToSort = relevantPoints.map(element => {
			const { x, y } = element.getBoundingClientRect()
			const xDiff = Math.abs(x - clientX)
			const yDiff = Math.abs(y - clientY)
			return {
				diff: xDiff + yDiff,
				element,
			}
		})

		pointsToSort.sort((a, b) => a.diff - b.diff)
		setHoverPoint(pointsToSort[0].element)
	}
}

function hover(hoveredPointInput, dataset = null) {
	const calculatePlotX = calculatePlotX$.get()
	const calculatePlotY = calculatePlotY$.get()

	const newHoverOverlaps = {}

	if (hoveredPointInput) {
		const pointYPosition = calculatePlotY(hoveredPointInput.y)

		if (refs.maxYLabel) {
			newHoverOverlaps.maxYLabel = overlapsY(refs.maxYLabel, pointYPosition)
		}

		if (refs.minYLabel) {
			newHoverOverlaps.minYLabel = overlapsY(refs.minYLabel, pointYPosition)
		}

		const pointXPosition = calculatePlotX(hoveredPointInput.x)

		if (refs.maxXLabel) {
			newHoverOverlaps.maxXLabel = overlapsX(refs.maxXLabel, pointXPosition)
		}

		if (refs.minXLabel) {
			newHoverOverlaps.minXLabel = overlapsX(refs.minXLabel, pointXPosition)
		}
	}

	hoveredPoint = hoveredPointInput
	hoverOverlaps = newHoverOverlaps
	hoveredColor = dataset && dataset.color
}

const plotWidth$ = w.computed(
	{ width$, leftMargin$, rightMargin$ },
	({ width$, leftMargin$, rightMargin$ }) => width$ - leftMargin$ - rightMargin$
)

const plotHeight$ = w.computed(
	{ height$, bottomMargin$, topMargin$ },
	({ height$, bottomMargin$, topMargin$ }) => height$ - bottomMargin$ - topMargin$
)

const minsAndMaxes$ = w.computed(
	{ datasets$ },
	({ datasets$ }) => flatten(
		datasets$ ? datasets$.map(({ points }) => points) : []
	).reduce(
		({ minX, maxX, minY, maxY }, { x, y }) => ({
			minX: min(minX, x),
			maxX: max(maxX, x),
			minY: min(minY, y),
			maxY: max(maxY, y),
		}), { minX: null, maxX: null, minY: null, maxY: null }
	)
)

const dataRanges$ = w.computed(
	{ minsAndMaxes$ },
	({ minsAndMaxes$ }) => ({
		x: minsAndMaxes$.maxX - minsAndMaxes$.minX,
		y: minsAndMaxes$.maxY - minsAndMaxes$.minY,
	})
)

const calculatePlotX$ = w.computed(
	{ leftMargin$, plotWidth$, minsAndMaxes$, dataRanges$, },
	({ leftMargin$, plotWidth$, minsAndMaxes$, dataRanges$, }) => x => {
		const xRatio = ((x - minsAndMaxes$.minX) / dataRanges$.x)

		return leftMargin$ + (xRatio * plotWidth$)
	}
)

const calculatePlotY$ = w.computed(
	{ plotHeight$, minsAndMaxes$, dataRanges$, topMargin$, },
	({ plotHeight$, minsAndMaxes$, dataRanges$, topMargin$, }) => y => {
		const yRatio = ((y - minsAndMaxes$.minY) / dataRanges$.y)

		return topMargin$ + plotHeight$ - (yRatio * plotHeight$)
	}
)

const yLabelX$ = w.computed(
	{ leftMargin$, plotXMargin$, tickLength$, labelBuffer$, },
	({ leftMargin$, plotXMargin$, tickLength$, labelBuffer$, }) =>
			leftMargin$ - plotXMargin$ - tickLength$ - (labelBuffer$ * 2)
)

const xLabelY$ = w.computed(
	{ topMargin$, plotHeight$, plotYMargin$, tickLength$, labelBuffer$ },
	({ topMargin$, plotHeight$, plotYMargin$, tickLength$, labelBuffer$ }) =>
			topMargin$ + plotHeight$ + plotYMargin$ + tickLength$ + labelBuffer$
)

const dataOpacity$ = w.computed(
	{ hoveredPoint$ },
	({ hoveredPoint$ }) => hoveredPoint$ ? 0.4 : 0.8
)

</script>

<svelte:meta namespace="svg" />

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">
	{#if !hoverOverlaps.maxYLabel}
		<text
			fill={baseColor}
			style="font-size: {fontSize}px;"
			text-anchor=end
			x={ $yLabelX$ }
			y={ $calculatePlotY$($minsAndMaxes$.maxY) }
			dy=4
			transition:fade={ {duration: 200} }
			bind:this={refs.maxYLabel}
		>
			{ formatY($minsAndMaxes$.maxY) }
		</text>
	{/if}
	{#if !hoverOverlaps.minYLabel}
		<text
			fill={baseColor}
			style="font-size: {fontSize}px;"
			text-anchor=end
			x={ $yLabelX$ }
			y={ $calculatePlotY$($minsAndMaxes$.minY) }
			dy=4
			transition:fade={ {duration: 200} }
			bind:this={refs.minYLabel}
		>
			{ formatY($minsAndMaxes$.minY) }
		</text>
	{/if}




	{#if !hoverOverlaps.maxXLabel}
		<text
			fill={baseColor}
			style="font-size: {fontSize}px;"
			text-anchor=middle
			x={ $calculatePlotX$($minsAndMaxes$.maxX) }
			y={ $xLabelY$ }
			dy={fontSize}
			transition:fade={ {duration: 200} }
			bind:this={refs.maxXLabel}
		>
			{ formatX($minsAndMaxes$.maxX) }
		</text>
	{/if}
	{#if !hoverOverlaps.minXLabel}
		<text
			fill={baseColor}
			style="font-size: {fontSize}px;"
			text-anchor=middle
			x={ $calculatePlotX$($minsAndMaxes$.minX) }
			y={ $xLabelY$ }
			dy={fontSize}
			transition:fade={ {duration: 200} }
			bind:this={refs.minXLabel}
		>
			{ formatX($minsAndMaxes$.minX) }
		</text>
	{/if}


	{#if leftFrame === 'ticks'}
		<g
			stroke-width={tickWidth}px
			stroke-opacity={$dataOpacity$ * 0.5}
		>
			{#each datasets as dataset}
				<g stroke={dataset.color}>
					{#each dataset.points as point}
						<line
							x1={leftMargin - plotXMargin - tickLength}px
							x2={leftMargin - plotXMargin}px
							y1={$calculatePlotY$(point.y)}px
							y2={$calculatePlotY$(point.y)}px
						/>
					{/each}
				</g>
			{/each}
		</g>
	{:elseif leftFrame === 'line'}
		<line
			x1={leftMargin - plotXMargin}px
			x2={leftMargin - plotXMargin}px
			y1={$calculatePlotY$($minsAndMaxes$.minY)}px
			y2={$calculatePlotY$($minsAndMaxes$.maxY)}px
			stroke={baseColor}
			stroke-width=1px
		/>
	{/if}


	<g fill-opacity=0>
		{#each datasets as dataset, datasetIndex}
			{#each dataset.points as point, pointIndex}
				<circle
					r={pointSize * 3}
					cx={$calculatePlotX$(point.x)}px
					cy={$calculatePlotY$(point.y)}px
					on:mousemove={calculateBestHover}
					on:click={() => hover(point, dataset)}
					data-dataset-index={datasetIndex}
					data-point-index={pointIndex}
				/>
			{/each}
		{/each}
	</g>

	<g fill-opacity={$dataOpacity$}>
		{#each datasets as dataset, datasetIndex}
			<g fill={dataset.color}>
				{#each dataset.points as point, pointIndex}
					<circle
						cx={$calculatePlotX$(point.x)}px
						cy={$calculatePlotY$(point.y)}px
						r={point === hoveredPoint ? pointSize * 3 : pointSize}
						fill-opacity={point === hoveredPoint ? 1 : 'inherit'}
						on:mousemove={calculateBestHover}
						on:click={() => hover(point, dataset)}
						on:mouseleave={() => hover(null)}
						data-dataset-index={datasetIndex}
						data-point-index={pointIndex}
						data-actual-point
						data-hovered={point === hoveredPoint}
					/>
				{/each}
			</g>
		{/each}
	</g>

	{#if bottomFrame === 'ticks'}
		<g
			stroke-width={tickWidth}px
			stroke-opacity={$dataOpacity$ * 0.5}
		>
			{#each datasets as dataset}
				<g stroke={dataset.color}>
					{#each dataset.points as point}
						<line
							x1={$calculatePlotX$(point.x)}px
							x2={$calculatePlotX$(point.x)}px
							y1={topMargin + plotYMargin + $plotHeight$}px
							y2={topMargin + plotYMargin + $plotHeight$ + tickLength}px
						/>
					{/each}
				</g>
			{/each}
		</g>
	{:elseif bottomFrame === 'line'}
		<line
			x1={$calculatePlotX$($minsAndMaxes$.minX)}px
			x2={$calculatePlotX$($minsAndMaxes$.maxX)}px
			y1={topMargin + plotYMargin + $plotHeight$}px
			y2={topMargin + plotYMargin + $plotHeight$}px
			stroke={baseColor}
			stroke-width=1px
		/>
	{/if}

	{#if hoveredPoint}
		<line
			x1={leftMargin - plotXMargin - tickLength}px
			x2={leftMargin - plotXMargin}px
			y1={$calculatePlotY$(hoveredPoint.y)}px
			y2={$calculatePlotY$(hoveredPoint.y)}px
			stroke={hoveredColor}
			stroke-width={tickWidth * 2}px
		/>

		<line
			x1={$calculatePlotX$(hoveredPoint.x)}px
			x2={$calculatePlotX$(hoveredPoint.x)}px
			y1={topMargin + plotYMargin + $plotHeight$}px
			y2={topMargin + plotYMargin + $plotHeight$ + tickLength}px
			stroke={hoveredColor}
			stroke-width={tickWidth * 2}px
		/>

		<text
			fill={hoveredColor}
			style="font-size: {fontSize}px;"
			text-anchor=end
			x={ $yLabelX$ }
			y={ $calculatePlotY$(hoveredPoint.y) }
			dy=4
		>
			{ formatY(hoveredPoint.y) }
		</text>
		<text
			fill={hoveredColor}
			style="font-size: {fontSize}px;"
			text-anchor=middle
			x={ $calculatePlotX$(hoveredPoint.x) }
			y={ $xLabelY$ }
			dy={fontSize}
		>
			{ formatX(hoveredPoint.x) }
		</text>
	{/if}

</svg>

<style>
	line {
		transition: stroke-opacity 400ms;
	}
	circle[data-hovered=false] {
		transition: fill-opacity 400ms;
	}
</style>

