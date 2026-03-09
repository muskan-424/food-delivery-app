import SupportAgent from "../models/supportAgentModel.js";
import userModel from "../models/userModel.js";
import SupportTicket from "../models/supportTicketModel.js";

// Create support agent
const createAgent = async (req, res) => {
  try {
    const { userId, agentName, email, phone, department, maxTickets, skills, workingHours } = req.body;

    if (!userId || !agentName || !email) {
      return res.status(400).json({ 
        success: false, 
        message: "userId, agentName, and email are required" 
      });
    }

    // Check if user exists
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if agent already exists
    const existingAgent = await SupportAgent.findOne({ userId });
    if (existingAgent) {
      return res.status(400).json({ 
        success: false, 
        message: "Agent already exists for this user" 
      });
    }

    const agent = new SupportAgent({
      userId,
      agentName,
      email,
      phone: phone || '',
      department: department || 'general',
      maxTickets: maxTickets || 10,
      skills: skills || [],
      workingHours: workingHours || { start: '09:00', end: '18:00' }
    });

    await agent.save();

    res.status(201).json({ 
      success: true, 
      message: "Support agent created successfully",
      data: agent
    });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ success: false, message: "Error creating support agent" });
  }
};

// Get all agents
const getAllAgents = async (req, res) => {
  try {
    const { status, department, isAvailable } = req.query;
    const query = {};

    if (status) query.status = status;
    if (department) query.department = department;
    if (isAvailable !== undefined) query.isAvailable = isAvailable === 'true';

    const agents = await SupportAgent.find(query)
      .populate('userId', 'name email profilePicture')
      .sort({ agentName: 1 });

    res.status(200).json({ success: true, data: agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ success: false, message: "Error fetching agents" });
  }
};

// Get agent by ID
const getAgent = async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = await SupportAgent.findById(agentId)
      .populate('userId', 'name email profilePicture');

    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    // Get agent's current tickets
    const currentTickets = await SupportTicket.find({ 
      assignedTo: agentId,
      status: { $in: ['assigned', 'in_progress', 'waiting_customer'] }
    }).countDocuments();

    agent.currentTickets = currentTickets;
    await agent.save();

    res.status(200).json({ success: true, data: agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ success: false, message: "Error fetching agent" });
  }
};

// Update agent
const updateAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { agentName, email, phone, department, status, maxTickets, skills, workingHours, isAvailable } = req.body;

    const agent = await SupportAgent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    if (agentName) agent.agentName = agentName;
    if (email) agent.email = email;
    if (phone !== undefined) agent.phone = phone;
    if (department) agent.department = department;
    if (status) agent.status = status;
    if (maxTickets) agent.maxTickets = maxTickets;
    if (skills) agent.skills = Array.isArray(skills) ? skills : [skills];
    if (workingHours) agent.workingHours = workingHours;
    if (isAvailable !== undefined) agent.isAvailable = isAvailable;

    agent.lastActive = new Date();
    await agent.save();

    res.status(200).json({ 
      success: true, 
      message: "Agent updated successfully",
      data: agent
    });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ success: false, message: "Error updating agent" });
  }
};

// Delete agent
const deleteAgent = async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = await SupportAgent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    // Check if agent has active tickets
    const activeTickets = await SupportTicket.countDocuments({ 
      assignedTo: agentId,
      status: { $in: ['assigned', 'in_progress', 'waiting_customer'] }
    });

    if (activeTickets > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete agent with ${activeTickets} active tickets. Please reassign tickets first.` 
      });
    }

    await SupportAgent.findByIdAndDelete(agentId);

    res.status(200).json({ 
      success: true, 
      message: "Agent deleted successfully"
    });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ success: false, message: "Error deleting agent" });
  }
};

// Get agent statistics
const getAgentStats = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { startDate, endDate } = req.query;

    const agent = await SupportAgent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const dateQuery = {};
    if (startDate || endDate) {
      dateQuery.createdAt = {};
      if (startDate) dateQuery.createdAt.$gte = new Date(startDate);
      if (endDate) dateQuery.createdAt.$lte = new Date(endDate);
    }

    const tickets = await SupportTicket.find({
      assignedTo: agentId,
      ...dateQuery
    });

    const stats = {
      totalTickets: tickets.length,
      resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
      inProgress: tickets.filter(t => t.status === 'in_progress' || t.status === 'waiting_customer').length,
      open: tickets.filter(t => t.status === 'open' || t.status === 'assigned').length,
      averageResponseTime: agent.averageResponseTime,
      averageResolutionTime: agent.averageResolutionTime,
      rating: agent.rating,
      totalRatings: agent.totalRatings,
      currentTickets: agent.currentTickets,
      maxTickets: agent.maxTickets,
      utilizationRate: ((agent.currentTickets / agent.maxTickets) * 100).toFixed(2)
    };

    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching agent stats:', error);
    res.status(500).json({ success: false, message: "Error fetching agent statistics" });
  }
};

// Get agent's tickets
const getAgentTickets = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    const query = { assignedTo: agentId };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tickets = await SupportTicket.find(query)
      .populate('userId', 'name email')
      .populate('orderId', 'orderNumber')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SupportTicket.countDocuments(query);

    res.status(200).json({ 
      success: true, 
      data: tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching agent tickets:', error);
    res.status(500).json({ success: false, message: "Error fetching agent tickets" });
  }
};

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const totalTickets = await SupportTicket.countDocuments();
    const openTickets = await SupportTicket.countDocuments({ status: 'open' });
    const assignedTickets = await SupportTicket.countDocuments({ status: 'assigned' });
    const inProgressTickets = await SupportTicket.countDocuments({ status: 'in_progress' });
    const resolvedTickets = await SupportTicket.countDocuments({ status: 'resolved' });
    const closedTickets = await SupportTicket.countDocuments({ status: 'closed' });
    const escalatedTickets = await SupportTicket.countDocuments({ escalated: true });
    const slaBreachedTickets = await SupportTicket.countDocuments({ slaBreached: true });

    const totalAgents = await SupportAgent.countDocuments();
    const activeAgents = await SupportAgent.countDocuments({ status: 'active', isAvailable: true });
    const busyAgents = await SupportAgent.countDocuments({ status: 'active', isAvailable: false });

    // Average response time across all agents
    const agents = await SupportAgent.find({});
    const avgResponseTime = agents.length > 0
      ? agents.reduce((sum, a) => sum + a.averageResponseTime, 0) / agents.length
      : 0;

    // Tickets by priority
    const ticketsByPriority = {
      urgent: await SupportTicket.countDocuments({ priority: 'urgent', status: { $ne: 'closed' } }),
      high: await SupportTicket.countDocuments({ priority: 'high', status: { $ne: 'closed' } }),
      medium: await SupportTicket.countDocuments({ priority: 'medium', status: { $ne: 'closed' } }),
      low: await SupportTicket.countDocuments({ priority: 'low', status: { $ne: 'closed' } })
    };

    // Tickets by category
    const ticketsByCategory = {
      order: await SupportTicket.countDocuments({ category: 'order', status: { $ne: 'closed' } }),
      payment: await SupportTicket.countDocuments({ category: 'payment', status: { $ne: 'closed' } }),
      delivery: await SupportTicket.countDocuments({ category: 'delivery', status: { $ne: 'closed' } }),
      refund: await SupportTicket.countDocuments({ category: 'refund', status: { $ne: 'closed' } }),
      account: await SupportTicket.countDocuments({ category: 'account', status: { $ne: 'closed' } }),
      technical: await SupportTicket.countDocuments({ category: 'technical', status: { $ne: 'closed' } }),
      other: await SupportTicket.countDocuments({ category: 'other', status: { $ne: 'closed' } })
    };

    res.status(200).json({
      success: true,
      data: {
        tickets: {
          total: totalTickets,
          open: openTickets,
          assigned: assignedTickets,
          inProgress: inProgressTickets,
          resolved: resolvedTickets,
          closed: closedTickets,
          escalated: escalatedTickets,
          slaBreached: slaBreachedTickets
        },
        agents: {
          total: totalAgents,
          active: activeAgents,
          busy: busyAgents
        },
        metrics: {
          averageResponseTime: Math.round(avgResponseTime),
          resolutionRate: totalTickets > 0 ? ((resolvedTickets + closedTickets) / totalTickets * 100).toFixed(2) : 0,
          slaCompliance: totalTickets > 0 ? ((totalTickets - slaBreachedTickets) / totalTickets * 100).toFixed(2) : 100
        },
        byPriority: ticketsByPriority,
        byCategory: ticketsByCategory
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: "Error fetching dashboard statistics" });
  }
};

export {
  createAgent,
  getAllAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  getAgentStats,
  getAgentTickets,
  getDashboardStats
};

