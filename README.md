# Anemone 

Anemone is a library for interactive evolutionary computation (interactive EC or IEC), and a set of plug-in demos for the library.

You can download this repo and double-click the html file, or you can [visit a hosted version at surge.sh](https://anemone.surge.sh/) (thanks!).

![Anemone logo](img/anemone.png)

# Interactive EC 

Evolutionary computation means algorithms inspired by Darwinian evolution, like genetic algorithms and genetic programming (not the same thing). 

# What do I do?

You should see a grid of images. Click the ones you like, then click "Evolve", and repeat endlessly.

If you select zero, it throws them all away to make totally new ones. If you select one, it makes new ones by mutating that good one. If you select two or more, it uses crossover to make children and mutation as well.

You can also change the palette (drop-down menu), or try a different "domain" for evolution (a different drop-down). Best ones: Anemone, SuperShape3D, Pattern, Robot.

# Program Trace Optimisation

The evolutionary algorithm in the background is [Program Trace Optimisation](https://github.com/Program-Trace-Optimisation/PTO). PTO is a highly general and easy-to-use evolutionary algorithm that -- uniquely -- defines a univeral representation, the **program trace**, suitable for all evolutionary algorithm problems. Instead of providing and encoding and search operators (initialisation, mutation, crossover), they just define a **generator function** which samples from the desired search space. In an interactive setting we don't need any fitness. 

# Adding new problems

Thanks to the PTO representation, it is extremely easy to add a new problem. It just requires one new file which defines a generator function. 


# MIDI?

It might ask you to enable MIDI. That's for music. You can say no if you just want to try the graphical settings.

# Is this AI Art?

Yes, but the good kind. There is no training corpus. 



# Creation

This was designed and partly implemented by me (jmmcd) but mostly implemented by Claude Code. 

