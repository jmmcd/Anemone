/**
 * Grammar — a generic BNF engine (shared infrastructure, like PTORepresentation).
 *
 * It only holds rules and answers questions about them (getProductions,
 * isNonTerminal, shortestProductions). The actual grammars live in the
 * individuals that use them (e.g. PatternGrammarIndividual, PolarCurveIndividual),
 * so each individual type is self-contained in one file — and a grammar is just a
 * plain rules object, which is what a future "edit the grammar in a text window"
 * feature would produce.
 *
 * Rules shape: { '<nonterminal>': [ [symbol, …], … ], … }. A symbol is a
 * non-terminal if it looks like <name>; anything else is a terminal.
 */
class Grammar {
    constructor(rules = {}) {
        this.rules = rules;
        // Kept for the code editor's "reset to default" (see Individual.grammarSection).
        this._originalRules = JSON.parse(JSON.stringify(rules));
    }

    addRule(nonTerminal, productions) {
        this.rules[nonTerminal] = productions;
    }

    // --- Editable-section support (the grammar is a search-space stage the user
    // can rewrite live). Rules are edited as JSON: { '<nt>': [[sym, …], …], … }.
    // Replaced in place so the derivation generator, which references this Grammar
    // by name, picks up the new productions on the next expansion.
    setRules(rules) {
        this.rules = rules;
    }

    sourceText() {
        return JSON.stringify(this.rules, null, 2);
    }

    originalSourceText() {
        return JSON.stringify(this._originalRules, null, 2);
    }
    
    getProductions(nonTerminal) {
        return this.rules[nonTerminal] || [];
    }
    
    isNonTerminal(symbol) {
        return symbol.startsWith('<') && symbol.endsWith('>');
    }
    
    getAllNonTerminals() {
        return Object.keys(this.rules);
    }

    /**
     * The productions for `symbol` that contain the fewest non-terminals — i.e.
     * the ones that lead toward terminals fastest. A derivation generator uses
     * these once it hits its depth limit, so the derivation always terminates.
     * Pure (no randomness): the caller picks among the returned productions.
     */
    shortestProductions(symbol) {
        const productions = this.getProductions(symbol);
        let best = Infinity;
        let out = [];
        for (const prod of productions) {
            const nNonTerminals = prod.filter(s => this.isNonTerminal(s)).length;
            if (nNonTerminals < best) { best = nNonTerminals; out = [prod]; }
            else if (nNonTerminals === best) { out.push(prod); }
        }
        return out;
    }

    toString() {
        let result = 'Grammar Rules:\n';
        for (const [nonTerminal, productions] of Object.entries(this.rules)) {
            result += `${nonTerminal} ::= `;
            result += productions.map(prod => prod.join(' ')).join(' | ');
            result += '\n';
        }
        return result;
    }
}