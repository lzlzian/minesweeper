const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, err: e.message });
  }
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertApprox(a, b, epsilon, msg) {
  if (Math.abs(a - b) > epsilon) throw new Error(msg ?? `expected ~${b} (±${epsilon}), got ${a}`);
}

// Tests get added in later tasks.

// Render
const out = document.getElementById('out');
const lines = results.map(r => {
  const status = r.pass ? 'PASS' : 'FAIL';
  const cls = r.pass ? 'pass' : 'fail';
  return `<span class="${cls}">${status}</span>  ${r.name}${r.err ? '  — ' + r.err : ''}`;
});
const summary = `${results.filter(r => r.pass).length}/${results.length} passing`;
out.innerHTML = [summary, '', ...lines].join('\n');
