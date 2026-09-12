(function(){
  var observer=null;
  function init(){
    var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var selector='main > section,main > article,main > div,.admin-content > section,.admin-content > article,.admin-content > div';
    var nodes=Array.from(document.querySelectorAll(selector)).filter(function(node){return !node.closest('[role="dialog"]')});
    nodes.forEach(function(node,index){node.classList.add('scroll-reveal');node.style.setProperty('--reveal-delay',Math.min(index%6,5)*24+'ms');if(reduced||node.getBoundingClientRect().top<window.innerHeight*.96)node.classList.add('scroll-reveal-visible')});
    document.documentElement.classList.add('scroll-motion-ready');
    if(reduced||!('IntersectionObserver'in window)){nodes.forEach(function(n){n.classList.add('scroll-reveal-visible')});return;}
    observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('scroll-reveal-visible');observer.unobserve(entry.target)}})},{rootMargin:'0px 0px -5% 0px',threshold:.04});
    nodes.forEach(function(node){if(!node.classList.contains('scroll-reveal-visible'))observer.observe(node)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
