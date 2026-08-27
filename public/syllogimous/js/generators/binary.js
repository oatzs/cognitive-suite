function createBinaryGeneratorPool(length) {
    let generators = [];
    if (savedata.enableDistinction)
        generators.push(createDistinctionGenerator(length));
    if (savedata.enableLinear)
        generators.push(...createLinearGenerators(length));
    if (savedata.enableSyllogism)
        generators.push(createSyllogismGenerator(length));
    if (savedata.enableDirection)
        generators.push(createDirectionGenerator(length));
    if (savedata.enableDirection3D)
        generators.push(createDirection3DGenerator(length));
    if (savedata.enableDirection4D)
        generators.push(createDirection4DGenerator(length));
    return generators;
}


function getBinaryCountdown(offset=0) {
    return savedata.overrideBinaryTime ? savedata.overrideBinaryTime + offset : null;
}

function evaluateBinaryOperand(index, a, b) {
    switch (index) {
        case 0: return a && b;
        case 1: return !(a && b);
        case 2: return a || b;
        case 3: return !(a || b);
        case 4: return !(a && b) && (a || b);
        case 5: return !(!(a && b) && (a || b));
        default: return false;
    }
}

class BinaryQuestion {
    create(length) {
        length = Math.max(4, length);
        const operandNames = [
            "AND",
            "NAND",
            "OR",
            "NOR",
            "XOR",
            "XNOR"
        ];

        const operandTemplates = [
            '$a <div class="is-connector">and</div> $b',
            '<div class="is-connector"></div> $a <div class="is-connector">nand</div> $b <div class="is-connector">are true</div>',
            '$a <div class="is-connector">or</div> $b',
            '<div class="is-connector">Neither</div> $a <div class="is-connector">nor</div> $b',
            '<div class="is-connector">Either</div> $a <div class="is-connector">or</div> $b',
            '<div class="is-connector">Both</div> $a <div class="is-connector">and</div> $b <div class="is-connector">are the same</div>'
        ];

        const pool = createBinaryGeneratorPool();
        let choice;
        let choice2;
        let premises;
        let conclusion = "";
        const flip = coinFlip();
        let isValid;
        const operandIndex = Math.floor(Math.random()*operandNames.length);
        while (flip !== isValid) {
            let [generator, generator2] = pickRandomItems(pool, 2).picked;

            [choice, choice2] = [
                generator.question.create(Math.floor(length/2)),
                generator2.question.create(Math.ceil(length/2))
            ];
    
            premises = [...choice.premises, ...choice2.premises];
            premises = scramble(premises);
    
            conclusion = operandTemplates[operandIndex]
                .replace("$a", choice.conclusion)
                .replace("$b", choice2.conclusion);

            isValid = evaluateBinaryOperand(operandIndex, choice.isValid, choice2.isValid);
        }

        const countdown = getBinaryCountdown();
        return {
            category: `Binary: ${choice.category} ${operandNames[operandIndex]} ${choice2.category}`,
            type: "binary",
            modifiers: ['op1'],
            startedAt: new Date().getTime(),
            subresults: [choice, choice2],
            isValid,
            premises,
            conclusion,
            ...(countdown && { countdown }),
        };
    }
}

class NestedBinaryQuestion {
    create(length) {
        const humanOperands = [
            '<span class="is-connector DEPTH">(</span>à<span class="is-connector DEPTH">)</span> <span class="is-connector DEPTH">AND</span><br><span class="INDENT"></span><span class="is-connector DEPTH">(</span>ò<span class="is-connector DEPTH">)</span>',
            '<span class="is-connector DEPTH">(</span>à<span class="is-connector DEPTH">)</span> <span class="is-connector DEPTH">NAND</span><br><span class="INDENT"></span><span class="is-connector DEPTH">(</span>ò<span class="is-connector DEPTH">)</span>',
            '<span class="is-connector DEPTH">(</span>à<span class="is-connector DEPTH">)</span> <span class="is-connector DEPTH">OR</span><br><span class="INDENT"></span><span class="is-connector DEPTH">(</span>ò<span class="is-connector DEPTH">)</span>',
            '<span class="is-connector DEPTH">(</span>à<span class="is-connector DEPTH">)</span> <span class="is-connector DEPTH">NOR</span><br><span class="INDENT"></span><span class="is-connector DEPTH">(</span>ò<span class="is-connector DEPTH">)</span>',
            '<span class="is-connector DEPTH">(</span>à<span class="is-connector DEPTH">)</span> <span class="is-connector DEPTH">XOR</span><br><span class="INDENT"></span><span class="is-connector DEPTH">(</span>ò<span class="is-connector DEPTH">)</span>',
            '<span class="is-connector DEPTH">(</span>à<span class="is-connector DEPTH">)</span> <span class="is-connector DEPTH">XNOR</span><br><span class="INDENT"></span><span class="is-connector DEPTH">(</span>ò<span class="is-connector DEPTH">)</span>'
        ];

        const pool = createBinaryGeneratorPool();

        length = Math.max(4, length);
        const halfLength = Math.floor(length / 2);
        const questions = Array(halfLength).fill(0)
            .map(() => pool[Math.floor(Math.random() * pool.length)].question.create(2));

        let numOperands = +savedata.maxNestedBinaryDepth;
        let i = 0;
        function generator(remaining, depth) {
            remaining--;
            const left = Math.floor(Math.random() * remaining);
            const right = remaining - left;
            const rndIndex = Math.floor(Math.random() * humanOperands.length);
            const humanOperand = humanOperands[rndIndex];
            const val = (left > 0)
                ? generator(left, depth+1)
                : (i++) % halfLength;
            const val2 = (right > 0)
                ? generator(right, depth+1)
                : (i++) % halfLength;
            const letter = String.fromCharCode(97 + depth);
            return {
                human: humanOperand
                    .replaceAll('DEPTH', 'depth-' + letter)
                    .replaceAll('INDENT', 'indent-' + letter)
                    .replace('à', val > - 1 ? val : val.human)
                    .replace('ò', val2 > - 1 ? val2 : val2.human),
                value: evaluateBinaryOperand(
                    rndIndex,
                    val > -1 ? questions[val].isValid : val.value,
                    val2 > -1 ? questions[val2].isValid : val2.value,
                ),
            };
        }

        const generated = generator(numOperands, 0);

        const category = Object.keys(
            questions
                .map(q => q.category)
                .reduce((a, c) => (a[c] = 1, a), {})
        )
        .join('/');
        const isValid = generated.value;
        const premises = questions.reduce((a, q) => [ ...a, ...q.premises ], [])
        const conclusion = generated.human.replaceAll(/(\d+)/g, m => questions[m].conclusion);
        const countdown = getBinaryCountdown();

        return {
            category: `Nested Binary: ${category}`,
            type: "binary",
            modifiers: [`op${numOperands}`],
            startedAt: new Date().getTime(),
            subresults: questions,
            isValid,
            premises,
            conclusion,
            ...(countdown && { countdown }),
        };
    }
}

function createBinaryGenerator(length) {
    return {
        question: new BinaryQuestion(),
        premiseCount: getPremisesFor('overrideBinaryPremises', length),
        weight: 100,
    };
}

function createNestedBinaryGenerator(length) {
    return {
        question: new NestedBinaryQuestion(),
        premiseCount: getPremisesFor('overrideBinaryPremises', length),
        weight: 100,
    };
}
