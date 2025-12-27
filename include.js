// include.js
window.headerReady = (async function () {
    console.log('Loading header component...');
    const res = await fetch('/component/header.html');
    const html = await res.text();
    document.getElementById('header').innerHTML = html;
})();
