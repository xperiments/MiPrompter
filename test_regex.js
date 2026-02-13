
const text = "A So let's break down the design of Prompter XL first, and then we'll talk about who Prompter XL is for.";

function parse(text) {
    const tokens = [];
    let globalWordIndex = 0;
    const tokenRegex = /([a-zA-Z0-9\u00C0-\u00FF'-]+)|(\n)|(\s+)|(.+?)/g;
    
    let match;
    let count = 0;
    while ((match = tokenRegex.exec(text)) !== null) {
      count++;
      if (count > 100) break; // Safety
      
      const displayVal = match[0];
      const isWord = match[1] !== undefined;
      const isNewline = match[2] !== undefined;
      const isSpace = match[3] !== undefined;
      const isOther = match[4] !== undefined;

      console.log(`Match: '${displayVal.replace(/\n/g, '\\n')}' | Word: ${isWord} | Space: ${isSpace} | Other: ${isOther}`);
      
      if (isWord) {
          tokens.push({ type: 'word', text: displayVal });
      } else if (isNewline || isSpace) {
          tokens.push({ type: 'space', text: displayVal });
      } else {
          tokens.push({ type: 'other', text: displayVal });
      }
    }
    return tokens;
}

const tokens = parse(text);
console.log("Total tokens:", tokens.length);
console.log("Reconstructed:", tokens.map(t => t.text).join(''));
