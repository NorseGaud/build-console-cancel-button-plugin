package com.veertu.jenkins.consolecancelbutton;

import static org.junit.Assert.assertTrue;

import org.junit.Rule;
import org.junit.Test;
import org.jvnet.hudson.test.JenkinsRule;

public class CancelButtonPageDecoratorTest {

    @Rule
    public JenkinsRule j = new JenkinsRule();

    @Test
    public void injectsCancelButtonAssets() throws Exception {
        JenkinsRule.WebClient wc = j.createWebClient();
        wc.getOptions().setJavaScriptEnabled(false);
        String html = wc.goTo("").getWebResponse().getContentAsString();
        assertTrue("footer should reference cancel-button.js",
                html.contains("cancel-button.js"));
        assertTrue("footer should reference cancel-button.css",
                html.contains("cancel-button.css"));
        assertTrue("footer should expose the Jenkins root URL for the client script",
                html.contains("data-root-url"));
    }
}
