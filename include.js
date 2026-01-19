// include.js
window.headerReady = (async function () {
    console.log('Loading header component...');
    const res = await fetch('/component/header.html');
    const html = await res.text();
    document.getElementById('header').innerHTML = html;
})();

window.setActiveNavById = function (activeId) {
    document
        .querySelectorAll('.nav-list a')
        .forEach(link => link.classList.remove('active'));

    const activeLink = document.getElementById(activeId);
    if (activeLink) {
        activeLink.classList.add('active');
    }
};

