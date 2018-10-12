import ScatterGraph from './ScatterGraph.html'
import r from 'regex-fun'
import sheetsy from 'sheetsy'
const { getSheet } = sheetsy

const documentId = `1ZFNKaLeZBkx3RmrKiv_qihhVphaNnnjEehhuRfir08U`
const sheet1Id = `ouieeg5`

const digits = /(\d+)/
const stupidDate = r.combine(/^/, digits, `/`, digits, `/`, digits, ` `, digits, `:`, digits, `:`, digits, /$/)
const pad2 = str => str.length === 1 ? `0` + str : str
const parseStupidDateOrIso = dateString => {
	const match = dateString.match(stupidDate)
	if (match) {
		const [ , month, day, year, hour, minute, second ] = match
		dateString = `${ year }-${ pad2(month) }-${ pad2(day) } ${ pad2(hour) }:${ pad2(minute) }:${ pad2(second) }`
	}

	return Date.parse(dateString)
}

async function main() {
	const graphTarget = document.getElementById(`graph-target`)

	const sheet = await getSheet(documentId, sheet1Id)

	const points = sheet.rows.map(({ timestamp, weight }) => ({
		x: parseStupidDateOrIso(timestamp),
		y: parseFloat(weight),
	}))

	graphTarget.innerText = ``

	new ScatterGraph({
		target: graphTarget,
		data: {
			dataset: {
				points,
				color: `#139090`,
			},
			bottomFrame: `ticks`,
			leftFrame: `ticks`,
			xLabel: `Date`,
			formatX: x => new Date(x).toLocaleDateString(),
			yLabel: `Pounds`,
			formatY: y => y.toFixed(1),
		},
	})
}

main()
