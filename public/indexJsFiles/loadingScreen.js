function checkLoadingComplete() {
    const isComplete = 
        document.getElementById("CountdownJS").checked &&
        document.getElementById("AuthJS").checked &&
        document.getElementById("ScriptJS").checked &&
        document.getElementById("ThemeJS").checked;
    
    if (isComplete) {
        $("#loading").fadeOut(1000, function() {
            $(this).css('display', 'none');
        });
    }
}

const loadingInterval = setInterval(() => {
    checkLoadingComplete();
    if (document.getElementById("CountdownJS").checked &&
        document.getElementById("AuthJS").checked &&
        document.getElementById("ScriptJS").checked &&
        document.getElementById("ThemeJS").checked) {
        clearInterval(loadingInterval);
    }
}, 100);