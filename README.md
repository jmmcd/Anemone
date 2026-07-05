# Anemone 

Anemone is a library for interactive evolutionary computation (interactive EC or IEC), and a set of plug-in demos for the library.

You can download this repo and double-click the html file, or you can [visit a hosted version at surge.sh](https://anemone.surge.sh/) (thanks!).

![Anemone logo](img/anemone.png)

# Interactive EC 

Evolutionary computation means algorithms inspired by Darwinian evolution, like genetic algorithms and genetic programming (not the same thing). 

Interactive means instead of a *fitness function*, fitness is determined by the user's preferences - a bit like a farmer breeding sheep.

# What do I do?

You should see a grid of images. Click the ones you like, then click "Evolve", and repeat endlessly.

If you select zero, then "Evolve" throws them all away to make totally new ones. If you select one, it makes new ones by mutating that good one. If you select two or more, it uses crossover to make children and mutation as well.

You can also change the palette (drop-down menu), or try a different "domain" for evolution (a different drop-down). Some of the best ones: Anemone, SuperShape3D, Pattern, Robot, Drum Machine.

# Program Trace Optimisation

The evolutionary algorithm in the background is [Program Trace Optimisation](https://github.com/Program-Trace-Optimisation/PTO). PTO is a highly general and easy-to-use evolutionary algorithm that -- uniquely -- defines a univeral representation, the **program trace**, suitable for all evolutionary algorithm problems. Instead of providing and encoding and search operators (initialisation, mutation, crossover), they just define a **generator function** which samples from the desired search space. In an interactive setting we don't need any fitness. 

# Adding new apps

Thanks to the PTO representation, it is extremely easy to add a new app. It just requires one new file which defines a generator function. 

# Palettes

You can change the palette, which affects the appearance of most apps, by pressing 'p' or using the side menu. We have a selection of palettes, many made using the OKLCH perceptual interpolation.

# Zoom in, saving, and loading

You can double-click an individual to zoom in on it. You'll then see a button for saving it, usually in `png` format, and/or `stl`, `wav`, or `midi` depending on the app. The `png` format includes the individual genome saved as metadata, and the Load button in the side menu allows you to load in a previously-saved individual.

# Hotkeys

* `0`, `1`, ... `9`, `A`, `B`, ... `F` selects or de-selects an individual, and
* `space` clicks the Evolve button.
* `[` and `]` zoom in and out on the 3D individuals, 
* `=` and `-` change the focal length of the 3D individuals, and 
* `\` resets all of the above to default.
* `p` cycles the palette.

# MIDI?

It might ask you to enable MIDI in your browser. That's for connecting some of the musical apps to your sequencer, eg GarageBand or Reaper. You can say no if you just want to try the graphical apps.

# Is this AI Art?

Yes, but the good kind. There is no training corpus. 



# Creation

This was designed and partly implemented by me (jmmcd) but mostly implemented by Claude Code. 

