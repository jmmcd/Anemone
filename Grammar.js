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
    
    derive(startSymbol, genome, maxDerivations = 1000, maxDepth = 15) {
        let derivation = [startSymbol];
        let genomeIndex = 0;
        let derivationSteps = 0;
        let currentDepth = 0;
        
        while (derivationSteps < maxDerivations && genomeIndex < genome.length && currentDepth < maxDepth) {
            let foundNonTerminal = false;
            let hasNonTerminals = false;
            
            // Count non-terminals and estimate depth
            for (let i = 0; i < derivation.length; i++) {
                if (this.isNonTerminal(derivation[i])) {
                    hasNonTerminals = true;
                    break;
                }
            }
            
            if (!hasNonTerminals) {
                break; // No more non-terminals to expand
            }
            
            // Find first non-terminal in current derivation
            for (let i = 0; i < derivation.length; i++) {
                if (this.isNonTerminal(derivation[i])) {
                    const nonTerminal = derivation[i];
                    const productions = this.getProductions(nonTerminal);
                    
                    if (productions.length > 0) {
                        // Use genome value to select production
                        const genomeValue = genome[genomeIndex % genome.length];
                        const productionIndex = genomeValue % productions.length;
                        const selectedProduction = productions[productionIndex];
                        
                        // Replace non-terminal with selected production
                        derivation.splice(i, 1, ...selectedProduction);
                        
                        genomeIndex++;
                        foundNonTerminal = true;
                        break;
                    }
                }
            }
            
            if (!foundNonTerminal) {
                break; // No more non-terminals to expand
            }
            
            derivationSteps++;
            
            // Estimate current depth by counting nested operations
            currentDepth = this.estimateDepth(derivation);
        }
        
        // If we still have non-terminals after hitting limits, replace them with defaults
        if (this.hasNonTerminals(derivation)) {
            derivation = this.replaceNonTerminalsWithDefaults(derivation);
        }
        
        return derivation;
    }
    
    estimateDepth(derivation) {
        let depth = 0;
        let currentLevel = 0;
        
        for (let symbol of derivation) {
            if (symbol === '(') {
                currentLevel++;
                depth = Math.max(depth, currentLevel);
            } else if (symbol === ')') {
                currentLevel--;
            }
        }
        
        return depth;
    }
    
    hasNonTerminals(derivation) {
        return derivation.some(symbol => this.isNonTerminal(symbol));
    }
    
    replaceNonTerminalsWithDefaults(derivation) {
        return derivation.map(symbol => {
            if (this.isNonTerminal(symbol)) {
                // Replace with appropriate default based on non-terminal type
                switch (symbol) {
                    case '<expr>':
                    case '<polar>':
                    case '<pattern>':
                        return '1.0';
                    case '<op>':
                        return '+';
                    case '<func>':
                        return 'sin';
                    case '<var>':
                        return 't';
                    case '<const>':
                        return '1.0';
                    default:
                        return '1.0';
                }
            }
            return symbol;
        });
    }
    
    derivesToString(derivation) {
        return derivation.join('');
    }
    
    static createMathExpressionGrammar() {
        return new Grammar({
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
                ['exp'],
                ['log'],
                ['sqrt'],
                ['abs']
            ],
            '<var>': [
                ['x'],
                ['y']
            ],
            '<const>': [
                ['0.1'],
                ['0.5'],
                ['1.0'],
                ['2.0'],
                ['-1.0'],
                ['3.14159']
            ]
        });
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