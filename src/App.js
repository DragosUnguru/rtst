import React from "react";
import { Route, BrowserRouter, Routes, useNavigate } from "react-router-dom";
import { Auth0Provider, withAuthenticationRequired } from "@auth0/auth0-react";
import Translator from "./Translator";

const ProtectedRoute = ({ component, ...args }) => {
    const Component = withAuthenticationRequired(component, args);
    return <Component />;
};

const Auth0ProviderWithRedirectCallback = ({ children, ...props }) => {
    const navigate = useNavigate();
    const onRedirectCallback = (appState) => {
        navigate((appState && appState.returnTo) || window.location.pathname);
    };
    return (
        <Auth0Provider onRedirectCallback={onRedirectCallback} {...props}>
            {children}
        </Auth0Provider>
    );
};

export default function App() {
    return (
        <BrowserRouter>
            <Auth0ProviderWithRedirectCallback
                domain="dev-c0y1ge78ubnbqbrj.us.auth0.com"
                clientId="8UJkF3vjFSwGcZo7Ut7H3mK3GMD983Su"
                redirectUri={window.location.origin}
            >
                <Routes>
                    <Route path="/" exact />
                    <Route
                        path="/translator"
                        element={<ProtectedRoute component={Translator} />}
                    />
                </Routes>
            </Auth0ProviderWithRedirectCallback>
        </BrowserRouter>
    );
}
