# configuration
If you are using (or adapting) server.js, do this:
- In the folder in which server.js resides, create a file called 'config.js'
- Open 'config.js' in a file editor, and insert the following:

    ```
    var config = {};

    config.api_key = 'ENTER_APIKEY_HERE';
    config.inst_token = 'ENTER_INSTTOKEN_HERE_IF_YOU_HAVE_ONE_ELSE_DELETE';

    module.exports = config;
    ```
    
- Paste your APIkey (obtained from http://dev.elsevier.com) in the right place
- If you don't have a valid insttoken (which you would have received from Elsevier support staff), delete the placeholder text. If you enter a dummy value, your API requests will fail.

The '.gitignore' file lists 'config.js' as a file to be ignored when committing apidemo to a GIT repository, which is to prevent your APIkey from being shared with the world. Make similar provisions when you change your configuration setup.
