package com.veertu.jenkins.consolecancelbutton;

import hudson.Extension;
import hudson.model.PageDecorator;

/**
 * Registers a page decorator whose footer.jelly injects the cancel-button
 * assets into every page. The injected script renders the button only on
 * build console pages.
 */
@Extension
public class CancelButtonPageDecorator extends PageDecorator {
}
