import ScatterGraph from './ScatterGraph.html'
import bigMacData from './big-mac.json'

import r from 'regex-fun'
import sheetsy from 'sheetsy'
const { getSheet } = sheetsy


import subtractMonths from 'date-fns/sub_months'

const pad2 = number => number < 10 ? `0` + number : number
const formatNumberAsDate = timestamp => {
	const date = new Date(timestamp)
	return `${ date.getFullYear() }-${ pad2(date.getMonth() + 1) }-${ pad2(date.getDate()) }`
}

async function main() {
	await setUpWeightGraph(document)

	setUpBigMacGraph(document)
}

main()

async function setUpWeightGraph(doc) {
	const points = await getWeightDataPoints()

	const weightRadioButtons = doc.querySelectorAll(`input[name=weight]`)

	const getCurrentDataset = () => {
		const currentlyChecked = Array.prototype.filter.call(weightRadioButtons, input => input.checked)
			.reduce((_, input) => input.value, `year`)
		return {
			color: `#139090`,
			points: points[currentlyChecked],
		}
	}

	const graph = new ScatterGraph({
		target: doc.getElementById(`graph-target`),
		data: {
			datasets: [ getCurrentDataset() ],
			bottomFrame: `ticks`,
			leftFrame: `ticks`,
			formatX: formatNumberAsDate,
			formatY: y => `${ y.toFixed(1) }lb`,
		},
	})

	doc.body.dataset.weightLoaded = true

	weightRadioButtons.forEach(element => {
		element.addEventListener(`change`, () => {
			if (element.checked) {
				graph.set({
					datasets: [ getCurrentDataset() ],
				})
			}
		})
	})
}

function setUpBigMacGraph(doc) {
	const colors = {
		GBP: `var(--gbpColor)`,
		EUR: `var(--eurColor)`,
	}

	const bigMacDatasets = Object.keys(bigMacData).map(
		currency => ({
			color: colors[currency],
			points: bigMacData[currency].map(
				({ date, strengthRelativeToUsd }) => ({
					x: new Date(date).valueOf(),
					y: strengthRelativeToUsd,
				})
			),
		})
	)

	console.log(bigMacDatasets)

	new ScatterGraph({
		target: doc.getElementById(`big-mac-target`),
		data: {
			datasets: bigMacDatasets,
			formatX: formatNumberAsDate,
			formatY: y => y.toFixed(2),
			bottomFrame: `line`,
		},
	})
}

async function getWeightDataPoints() {
	const documentId = `1ZFNKaLeZBkx3RmrKiv_qihhVphaNnnjEehhuRfir08U`
	const sheet1Id = `ouieeg5`

	const digits = /(\d+)/
	const stupidDate = r.combine(/^/, digits, `/`, digits, `/`, digits, ` `, digits, `:`, digits, `:`, digits, /$/)
	const mostlyIsoDate = r.combine(/^/, digits, `-`, digits, `-`, digits, ` `, digits, `:`, digits, /$/)
	const toDate = (...stringParams) => new Date(...stringParams.map(str => parseInt(str, 10))).valueOf()
	const parseStupidDateOrIso = dateString => {
		const match = dateString.match(stupidDate)
		if (match) {
			const [ , month, day, year, hour, minute, second ] = match
			return toDate(year, month, day, hour, minute, second)
		} else {
			const [ , year, month, day, hour, minute ] = dateString.match(mostlyIsoDate)
			return toDate(year, month, day, hour, minute)
		}
	}



	const sheet = await getSheet(documentId, sheet1Id)

	const allPoints = sheet.rows.map(({ timestamp, weight }) => ({
		x: parseStupidDateOrIso(timestamp),
		y: parseFloat(weight),
	}))

	const now = new Date()
	const yearAgo = subtractMonths(now, 12).valueOf()
	const threeMonthsAgo = subtractMonths(now, 3).valueOf()

	const year = allPoints.filter(({ x: timestamp }) => timestamp > yearAgo)

	return {
		year,
		threeMonths: year.filter(({ x: timestamp }) => timestamp > threeMonthsAgo),
	}
}
