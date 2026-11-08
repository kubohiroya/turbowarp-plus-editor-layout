import assert from 'node:assert/strict';
import test from 'node:test';

import {documentPanelTitle} from '../src/document-workspace.ts';

const request = {
    reference: {providerId: 'provider', documentId: 'example'},
    filename: 'example.yaml',
    mount: () => ({requestClose () {}, dispose () {}})
};

test('a document tab names its file and source unless the request gives a title', () => {
    assert.equal(documentPanelTitle(request), 'example.yaml (provider / example)');
    assert.equal(documentPanelTitle({...request, title: 'Debugger'}), 'Debugger');
});
