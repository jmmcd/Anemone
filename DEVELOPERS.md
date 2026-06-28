# Architecture

The system separates three concerns:

- **Representations** (`representations/`) — genome structure and genetic operators are provided by a Javascript version of [Program Trace Optimisation](https://github.com/Program-Trace-Optimisation/PTO). This means for every new problem we don't need to implement operators, as PTO is "universal". 
- **Modalities** (`modalities/`) — output mechanisms (`Canvas2DModality`, `MIDIModality` with Web Audio fallback, `ThreeDModality`)
- **Individuals** (root `*.js`) — application code that composes a representation and a modality

Each individual holds a representation object and delegates `mutate`, `crossover`, and `clone` to it. Rendering is either done inline or via a modality helper. See `CLAUDE.md` for the full architecture reference.

* Visualiser can be from genome, phenotype, or both, it's up to the individual.

# Deployment

I deploy this to Surge just by running this in the current directory:

```surge . anemone.surge.sh``` 

# Adding a new problem

The goal is to design Anemone so that adding a new problems is easy. With PTO we don't need to define a new representation (encoding and search operators) for every problem. Instead the user only has to supply a **generator function** which samples from the solution space. It should go into a new XYZIndividual.js class where XYZ is your application name. There are several audio, MIDI and graphics rendering examples already provided, so many new applications won't need much code. 