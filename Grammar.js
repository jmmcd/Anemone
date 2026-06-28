class Grammar {
    constructor(rules = {}) {
        this.rules = rules;
    }
    
    addRule(nonTerminal, productions) {
        this.rules[nonTerminal] = productions;
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

    static createImagePatternGrammar() {
        return new Grammar({
            '<pattern>': [
                ['<expr>']
            ],
            '<expr>': [
                ['<expr>', '<op>', '<expr>'],
                ['<func>', '(', '<expr>', ')'],
                ['ifpos', '(', '<expr>', ',', '<expr>', ',', '<expr>', ')'],
                ['<var>'],
                ['<const>']
            ],
            '<op>': [
                ['+'],
                ['-'],
                ['*'],
                ['/'],
                ['%']
            ],
            '<func>': [
                ['sin'],
                ['cos'],
                ['tan'],
                ['exp'],
                ['log'],
                ['sqrt'],
                ['abs'],
                ['floor'],
                ['ceil']
            ],
            '<var>': [
                ['x'],
                ['y'],
                ['r'],
                ['theta'],
                ['(x+y)'],
                ['(x-y)'],
                ['(x*y)']
            ],
            '<const>': [
                ['0.1'],
                ['0.5'],
                ['1.0'],
                ['2.0'],
                ['3.0'],
                ['-1.0'],
                ['-0.5'],
                ['3.14159'],
                ['6.28318']
            ]
        });
    }
    
    static createPolarDrawingGrammar() {
        return new Grammar({
            '<polar>': [
                ['<expr>']
            ],
            '<expr>': [
                ['<expr>', '<op>', '<expr>'],
                ['<func>', '(', '<expr>', ')'],
                ['<var>'],
                ['<const>']
            ],
            '<op>': [
                ['+'],
                ['-'],
                ['*'],
                ['/']
            ],
            '<func>': [
                ['sin'],
                ['cos'],
                ['tan'],
                ['exp'],
                ['log'],
                ['sqrt'],
                ['abs']
            ],
            '<var>': [
                ['t'],
                ['(t*2)'],
                ['(t/2)'],
                ['(t*3)'],
                ['(t/3)']
            ],
            '<const>': [
                ['1.0'],
                ['2.0'],
                ['3.0'],
                ['0.5'],
                ['0.1'],
                ['5.0'],
                ['10.0'],
                ['3.14159'],
                ['6.28318']
            ]
        });
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