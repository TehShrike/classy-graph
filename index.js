import ScatterGraph from './ScatterGraph.html'
import r from 'regex-fun'
import sheetsy from 'sheetsy'
const { getSheet } = sheetsy

async function main() {
	const points = await getWeightDataPoints()

	const graphTarget = document.getElementById(`graph-target`)

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
			formatX: x => new Date(x).toLocaleDateString(),
			formatY: y => `${ y.toFixed(1) }lb`,
		},
	})
}

main()

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

	return sheet.rows.map(({ timestamp, weight }) => ({
		x: parseStupidDateOrIso(timestamp),
		y: parseFloat(weight),
	}))
}
