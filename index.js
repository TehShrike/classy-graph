import ScatterGraph from './ScatterGraph.html'
import r from 'regex-fun'
import sheetsy from 'sheetsy'
const { getSheet } = sheetsy

const key = `1ZFNKaLeZBkx3RmrKiv_qihhVphaNnnjEehhuRfir08U`
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

	const sheet = await getSheet(key, sheet1Id)

	const points = sheet.rows.map(({ timestamp, weight }) => ({
		x: parseStupidDateOrIso(timestamp),
		y: parseFloat(weight),
	}))

	console.log(points)

	graphTarget.innerText = ``

	new ScatterGraph({
		target: graphTarget,
		data: {
			points,
			xLabel: `Date`,
			yLabel: `Pounds`,
		},
	})
}

main()
