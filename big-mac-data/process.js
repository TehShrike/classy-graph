const neatCsv = require(`neat-csv`)
const toCamelCase = require(`camelcase`)

const isoZones = new Set([ `CAN`, `GBR`, `USA` ])

const relative = path => require(`path`).join(__dirname, path)

async function main() {
	const csv = require(`fs`).readFileSync(relative(`./downloaded-2022-09-19.csv`), { encoding: `utf8` })

	const data = await neatCsv(csv, {
		mapHeaders: toCamelCase,
	})

	// const usdPrices = new Map()

	// data.filter(
	// 	({ isoA3 }) => isoA3 === `USA`
	// ).forEach(
	// 	({ date, localPrice }) => usdPrices.set(date, parseFloat(localPrice))
	// )

	const desiredData = data.filter(
		({ isoA3 }) => isoZones.has(isoA3),
	).map(
		({ currencyCode, localPrice, dollarEx, date }) => ({
			currencyCode,
			date,
			usdCost: parseFloat(localPrice) / parseFloat(dollarEx),
		}),
	)

	const points = {}
	desiredData.forEach(({ currencyCode, date, usdCost }) => {
		points[currencyCode] = points[currencyCode] || []

		points[currencyCode].push({
			date,
			usdCost,
		})
	})

	// "how many big macs could you buy in the US if you took the local price of a big mac
	// in Europe or Britain and converted it to dollars"

	require(`fs`).writeFileSync(relative(`../big-mac.json`), JSON.stringify(points, null, `\t`))
}

main()

