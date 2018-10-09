import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import svelte from 'rollup-plugin-svelte'

export default {
	input: `./index.js`,
	output: {
		file: `./public/bundle.js`,
		format: `iife`,
		sourcemap: true,
	},
	plugins: [
		svelte(),
		commonjs(),
		resolve({
			browser: true,
		}),
	],
}
