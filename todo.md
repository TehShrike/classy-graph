# MVP

- make the highlight color based on the dataset color
	- make the hovered thing the same color as the item
	- lower the opacity for the non-hovered things
	- opacity of 1 for the hovered thing
- explain the principles from the chapter
- style blockquotes and page subtitle

# things to poke at

- data points should be considered hovered as soon as the cursor is within the hover size radius, not the data point radius
	- or maybe: if no hover indicator is under the mouse cursor, but the mouse cursor is within ~10px or so of a data point, take whichever data point is closest to the cursor and consider it hovered
- use svg groups to apply strokes and fills to data points and ticks
- a transition when switching between date ranges would be nice
	- would need to pass in minX/maxX/minY/maxY values
	- minsAndMaxes should only consider values within that range
	- every data point and tick should have a css transition on their xs and ys
