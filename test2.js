const fs = require('fs');
let code = fs.readFileSync('js/footing-design.js', 'utf-8');

const doc = {
  elements: {
    'footing-fc': { value: 3000 },
    'footing-fy': { value: 60000 },
    'footing-gamma': { value: 100 },
    'footing-qa': { value: 4 },
    'footing-c1': { value: 12 },
    'footing-c2': { value: 12 },
    'footing-dl': { value: 120 },
    'footing-ll': { value: 80 },
    'footing-surcharge': { value: 5 },
    'footing-cover': { value: 3 },
    'footing-d': { value: 12 },
    'footing-rebar-l': { value: 16 },
    'footing-rebar-s': { value: 16 },
    'footing-out-area': {},
    'footing-out-bb': {},
    'footing-out-vu1': {},
    'footing-out-pvc1': {},
    'footing-out-vu2': {},
    'footing-out-pvc2': {},
    'footing-out-as': {},
    'footing-out-asmin': {},
    'footing-out-rebar': {},
    'footing-status-badge': { style: {} },
    'footing-diagram': { innerHTML: '', appendChild: function(){} },
    'btn-footing-pdf': {}
  },
  getElementById: function(id) { 
      return this.elements[id] || { style: {}, appendChild: function(){}, setAttribute: function(){} }; 
  },
  createElementNS: function(ns, tag) {
      return { setAttribute: function(){}, appendChild: function(){} };
  }
};

global.document = doc;
global.window = {};
global.localStorage = { getItem: () => 'true' };

eval(code);
runFootingLogic();
console.log("Area:", doc.elements['footing-out-area'].textContent);
console.log("Status:", doc.elements['footing-status-badge'].textContent);
