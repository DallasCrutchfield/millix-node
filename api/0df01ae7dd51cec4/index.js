import Endpoint from '../endpoint';
import mutex from "../../core/mutex";


/**
 * api list_backlog_records
 */
class _0df01ae7dd51cec4 extends Endpoint {
    constructor() {
        super('0df01ae7dd51cec4');
    }

    /**
     * returns a list of backlog transaction.
     * @param app
     * @param req
     * @param res
     */
    handler(app, req, res) {
        try {
            let data = mutex.getBacklogData()
            res.send({
                api_status: 'success',
                api_message: data
            });
        } catch (e) {
            res.send({
                api_status: 'fail',
                api_message: `unexpected generic api error: (${e})`
            });
        }
    }
}


export default new _0df01ae7dd51cec4();
