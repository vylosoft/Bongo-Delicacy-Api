module.exports = (req, res, next) => {
    res.success = ({data = null, message = "Success", status = 200}) => {
        return res.status(status).json({
            message,
            data
        });
    };
    res.error = ({message = "Something went wrong", status = 500, invalid = undefined}) => {
        return res.status(status).json({
            error: true,
            message,
            invalid
        });
    }
    next();
};