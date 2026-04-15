
        // Init firebase only for auth check at the head
        const fwConfig = {
            apiKey: "AIzaSyBscP8FT1dcnHlSFMXc3DlfXSgRO9ET9s4",
            authDomain: "streamingdpc-7e7fa.firebaseapp.com",
            databaseURL: "https://streamingdpc-7e7fa-default-rtdb.firebaseio.com",
            projectId: "streamingdpc-7e7fa",
            storageBucket: "streamingdpc-7e7fa.firebasestorage.app",
            messagingSenderId: "831116907849",
            appId: "1:831116907849:web:ee8e744db342970fd0b698"
        };
        if (!firebase.apps.length) {
            firebase.initializeApp(fwConfig);
        }
        
        firebase.auth().onAuthStateChanged((user) => {
            if (!user) {
                // Kick out unauthenticated access
                window.location.href = 'login.html';
            }
        });

        // Ensure original logout overrides clear firebase session
        window.logout = function() {
            firebase.auth().signOut().then(() => {
                window.location.href = 'login.html';
            });
        };
    