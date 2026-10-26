/* Browser audit: served by tests/run_audit.py; no libraries or model changes. */
import * as m10 from '../m10.js';
const results = { checks: 0, combinations: 0, forestAverages: 0, boostingSteps: 0, failures: [] };
const $ = (id) => document.getElementById(id);
function assert(ok, message) { results.checks++; if (!ok) throw Error(message); }
const near = (a, b, tolerance = 0.0002) => Math.abs(a - b) <= tolerance;
const tick = () => new Promise((r) => setTimeout(r, 5));
async function ready() {
  for (let i = 0; i < 2000; i++) {
    if ($('section').getAttribute('aria-busy') === 'false') { await tick(); return; }
    await tick();
  }
  throw Error('Render did not settle');
}
async function change(id, value) {
  $(id).value = value; $(id).dispatchEvent(new Event('change')); await ready();
}
async function model(name) { location.hash = name; await tick(); await ready(); }
function slide(id, value) { $(id).value = value; $(id).dispatchEvent(new Event('input')); }
const signed = (v, d = 1) => (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(d);
function accessibility() {
  const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
  assert(new Set(ids).size === ids.length, 'unique element IDs');
  for (const el of document.querySelectorAll('[aria-labelledby],[aria-describedby]')) {
    for (const id of ((el.getAttribute('aria-labelledby') || '') + ' ' + (el.getAttribute('aria-describedby') || '')).trim().split(/\s+/)) assert($(id), 'ARIA target ' + id);
  }
  for (const el of document.querySelectorAll('input,select')) assert(el.labels.length > 0, 'control label');
  for (const el of document.querySelectorAll('svg[role="img"]')) assert(el.querySelector('title') && el.querySelector('desc'), 'chart accessible title/description');
  assert(document.querySelectorAll('nav a[aria-current="page"]').length === 1, 'one active navigation link');
  assert(document.documentElement.scrollWidth <= innerWidth + 1, 'no document overflow at ' + innerWidth);
  assert(!/NaN|undefined|Infinity/.test($('section').textContent), 'finite displayed values');
}
try {
  const mode = new URLSearchParams(location.search).get('mode');
  if (mode === 'direct') {
    await ready();
    const section = location.hash.slice(1);
    assert(document.querySelector('.'+section+'-section'), 'cold deep link '+section);
    assert($('dataset').options.length===3 && $('person').options.length===5, 'deep link selectors');
    accessibility();
    assert(window.auditErrors.length===0 && window.auditConsole.length===0, 'deep link has no JavaScript errors');
  } else if (mode === 'missing') {
    await ready(); assert($('load-retry') && document.querySelector('[role="alert"]'), 'visible failure and recovery control');
    assert(window.auditErrors.length === 0, 'no unhandled failure');
    assert(window.auditConsole.length === 1, 'one intentional diagnostic for failed load');
  } else {
    // Three overlapping cold loads: the slow initial glucose response finishes last.
    $('dataset').value = 'fev1'; $('dataset').dispatchEvent(new Event('change'));
    $('dataset').value = 'sbp'; $('dataset').dispatchEvent(new Event('change'));
    await ready(); await change('person', 'P4');
    for (let i = 0; i < 60; i++) await tick();
    assert($('dataset').value === 'sbp' && $('person').value === 'P4' && $('selection-context').textContent.includes('mmHg'), 'latest selection wins delayed cold loads');
    const expected = {
      glucose: { baseline:'113.8', linear:'99.4', up:'Waist circumference (+1.4', forest:'108.6', tree1:'110.0', first:'112.4', last:'102.5', best:21, rmse:'20.4' },
      sbp: { baseline:'125.9', linear:'123.3', up:'Race / ethnicity (+1.3', forest:'119.6', tree1:'131.3', first:'125.7', last:'127.1', best:38, rmse:'16.1' },
      fev1: { baseline:'2878.6', linear:'3217.9', up:'Sex (+390.2', forest:'1982.5', tree1:'2003.0', first:'2784.0', last:'1831.8', best:79, rmse:'537.7' }
    };
    for (const key of m10.DATASETS) {
      await change('dataset', key);
      const b = await m10.loadBundle(key), e = expected[key], gb = b.boosting;
      assert($('person').options.length === 5 && $('dataset').options.length === 3, 'all required selections');
      assert(near(b.linear.baseline, b.linear.intercept + b.features.reduce((s,f)=>s+b.linear.coefficients[f.name]*b.linear.reference[f.name],0), .001), 'baseline is prediction at reference');
      assert(gb.rmse.train.length === 501 && gb.rmse.validation.length === 501, 'RMSE arrays 0..500');
      assert(gb.rmse.train.every(v=>Number.isFinite(v)&&v>=0) && gb.rmse.validation.every(v=>Number.isFinite(v)&&v>=0), 'finite nonnegative RMSE');
      assert(gb.best_validation_round === e.best && gb.best_validation_rmse.toFixed(1) === e.rmse, 'check.md best validation');
      assert(gb.best_validation_rmse === Math.min(...gb.rmse.validation) && gb.rmse.validation.indexOf(Math.min(...gb.rmse.validation)) === gb.best_validation_round, 'minimum and selected best round');
      for (const group of b.categorical_groups) for (const level of group.levels) {
        const inputs=m10.categoryInputs(b,group.name,level.label);
        assert(Object.values(inputs).filter(v=>v===1).length === (level.column?1:0), 'valid single category encoding');
        assert(m10.categoryOf(b,group.name,inputs)===level.label, 'category encoding round trip');
      }
      for (const person of b.people) {
        await change('person', person.id);
        await model('linear'); results.combinations++;
        const ex=m10.linearExplain(b,person.values), supplied=b.linear.people[person.id];
        assert(near(ex.prediction,supplied.prediction,.001), 'linear supplied prediction '+key+person.id);
        assert(near(ex.baseline+Object.values(ex.groupedPushes).reduce((s,v)=>s+v,0),ex.prediction), 'baseline plus grouped pushes');
        for (const f of b.features) {
          assert(near(ex.pushes[f.name],b.linear.coefficients[f.name]*(person.values[f.name]-b.linear.reference[f.name])), 'signed push formula');
          assert(near(ex.pushes[f.name],supplied.pushes[f.name],.001), 'supplied push');
        }
        for (const [name,v] of Object.entries(ex.groupedPushes)) {
          assert(near(v,supplied.grouped_pushes[name],.001), 'supplied grouped push');
          assert($('linear-results').textContent.includes(signed(v)+' '+b.units), 'display signed grouped push');
        }
        assert($('linear-summary').textContent.includes(ex.prediction.toFixed(1)+' '+b.units), 'display prediction units');
        assert(document.querySelectorAll('[data-g]').length===b.categorical_groups.length,'one selector per category');
        assert(document.querySelectorAll('.linear-waterfall rect').length===Object.keys(ex.groupedPushes).length+2,'grouped waterfall bars');
        for (const group of b.categorical_groups) {
          const el=document.querySelector('[data-g="'+group.name+'"]');
          for (const level of group.levels) {
            el.value=level.label;el.dispatchEvent(new Event('change'));
            const values={...person.values};
            for(const g of b.categorical_groups) Object.assign(values,m10.categoryInputs(b,g.name,document.querySelector('[data-g="'+g.name+'"]').value));
            assert($('linear-summary').textContent.includes(m10.linearExplain(b,values).prediction.toFixed(1)+' '+b.units),'category UI prediction');
          }
        }
        const categoryDetails=document.querySelector('.linear-section details');
        categoryDetails.querySelector('summary').click();assert(categoryDetails.open,'category comparison disclosure');
        $('linear-reset').click();
        const input=document.querySelector('[data-f]');input.focus();
        const old=$('linear-summary').textContent;input.value='';input.dispatchEvent(new Event('input'));
        assert(input.getAttribute('aria-invalid')==='true' && $('linear-summary').textContent===old,'empty input preserves last valid prediction');
        input.value=Number(input.max)+1;input.dispatchEvent(new Event('input'));assert($('linear-summary').textContent===old,'out-of-range input');
        const newValue=Number(person.values[input.dataset.f])+(Number(person.values[input.dataset.f])+.1>Number(input.max)?-.1:.1);
        input.value=newValue;input.dispatchEvent(new Event('input'));
        const edited={...person.values,[input.dataset.f]:newValue};
        assert(document.activeElement===input&&$('linear-summary').textContent.includes(m10.linearExplain(b,edited).prediction.toFixed(1)+' '+b.units),'live input prediction and focus');
        accessibility();
        // Switch with edits still active: forest and boosting must use original supplied values.
        await model('forest'); results.combinations++;
        const trees=b.forest.people[person.id].tree_predictions;
        assert(trees.length===100 && near(m10.runningAverage(trees,100),b.forest.people[person.id].prediction,.001),'full forest supplied average');
        const slider=$('ntrees');slider.focus();
        for(let n=1;n<=100;n++) {
          slide('ntrees',n);results.forestAverages++;
          const independent=trees.slice(0,n).reduce((s,v)=>s+v,0)/n;
          assert(near(m10.runningAverage(trees,n),independent),'helper partial mean');
          assert($('forest-summary').textContent.includes((n<100?'Partial forest':'Full forest')+':')&&$('forest-summary').textContent.includes(independent.toFixed(1)+' '+b.units),'partial/full displayed average');
          assert(document.querySelectorAll('.forest-tree.included').length===n&&document.activeElement===slider&&$('ntrees')===slider,'included count and stable slider');
        }
        const rows=[...document.querySelectorAll('#forest-tree-rows tr')];
        assert(rows.length===100,'all tree data available');
        rows.forEach((row,i)=>assert(row.cells[1].textContent===trees[i].toFixed(1)+' '+b.units,'individual tree value'));
        const treeDetails=document.querySelector('.forest-card details');
        treeDetails.querySelector('summary').click();assert(treeDetails.open,'forest data disclosure');
        accessibility();
        await model('boosting'); results.combinations++;
        const p=gb.people[person.id];
        assert($('round').value==='0'&&$('round-prev').disabled,'begins zero and lower boundary');
        assert($('boosting-results').textContent.includes(gb.init.toFixed(1)+' '+b.units),'round zero training average');
        assert(p.staged.length===501&&p.corrections.length===500&&near(p.staged[0],gb.init),'staged arrays and init');
        for(let m=1;m<=500;m++) {assert(near(p.staged[m-1]+p.corrections[m-1],p.staged[m]),'boosting correction identity');results.boostingSteps++;}
        const range=$('round');range.focus();
        for(const n of [1,2,e.best-1,e.best,e.best+1,250,499,500]) {
          slide('round',n);
          assert($('boosting-previous').textContent===p.staged[n-1].toFixed(1)+' '+b.units,'previous stage');
          assert($('boosting-correction').textContent===signed(p.corrections[n-1],2)+' '+b.units,'correction not double scaled');
          assert($('boosting-updated').textContent===p.staged[n].toFixed(1)+' '+b.units,'updated stage');
          assert($('boosting-comparison').textContent.includes(gb.rmse.train[n].toFixed(1)+' '+b.units)&&$('boosting-comparison').textContent.includes(gb.rmse.validation[n].toFixed(1)+' '+b.units),'both selected RMSE values');
          assert(document.activeElement===range&&$('round')===range,'boosting slider mounted/focused');
        }
        assert($('round-next').disabled,'upper boundary');$('round-prev').click();assert(range.value==='499','previous');$('round-next').click();assert(range.value==='500','next');
        $('round-best').click();assert(Number(range.value)===e.best&&$('boosting-comparison').textContent.includes('You selected'),'choose best');
        $('round-start').click();assert(range.value==='0','back zero');
        assert(document.querySelector('.boosting-training-curve').getAttribute('stroke-dasharray')&&document.querySelector('.boosting-chart').textContent.includes('RMSE ('+b.units+')'),'RMSE axis and noncolor distinction');
        accessibility();
      }
      await change('person','P1');
      assert($('boosting-results').textContent.includes(e.baseline+' '+b.units),'check.md round0');
      slide('round',1);assert($('boosting-updated').textContent===e.first+' '+b.units,'check.md round1');
      slide('round',500);assert($('boosting-updated').textContent===e.last+' '+b.units,'check.md round500');
      await model('forest');assert($('forest-results').textContent.includes(e.forest+' '+b.units)&&$('forest-results').textContent.includes(e.tree1+' '+b.units),'check.md forest and tree1');
      await model('linear');const text=$('linear-results').textContent;assert(text.includes(e.baseline)&&text.includes(e.linear)&&text.includes(e.up),'check.md linear and biggest push');
      if(key==='fev1')assert(document.querySelector('.linear-caution'),'lung function limitation visible');
    }
    await model('forest');$('forest-review-example').click();await ready();assert($('dataset').value==='glucose'&&$('person').value==='P4','reviewer task shortcut');
    document.querySelector('.skip-link').click();assert(document.activeElement===$('section')&&location.hash==='#forest','keyboard skip preserves model');
    assert(window.auditErrors.length===0,'no JS errors or unhandled rejections: '+JSON.stringify(window.auditErrors));
    assert(window.auditConsole.length===0,'no console errors: '+JSON.stringify(window.auditConsole));
    assert(window.auditRequests.every(r=>r.ok),'successful relative fetches');
  }
} catch(error) {results.failures.push(error.stack);}
results.viewport=innerWidth;results.dark=matchMedia('(prefers-color-scheme: dark)').matches;
results.errors=window.auditErrors;results.consoleErrors=window.auditConsole;results.requests=window.auditRequests;
window.auditResult=results;
document.body.innerHTML='<pre id="audit-result"></pre>';$('audit-result').textContent=JSON.stringify(results);
